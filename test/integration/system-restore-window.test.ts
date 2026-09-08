import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { startSystem } from "../../src/start-system.js";
import { DatabaseService } from "../../src/database/database.service.js";
import { SiteRepository } from "../../src/modules/sites/site.repository.js";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error("TEST_ADMIN_DATABASE_URL required for restore integration");
const name = `system_g5_restore_${randomUUID().replaceAll("-", "")}`,
  url = new URL(adminUrl);
url.pathname = `/${name}`;
const admin = new Client({ connectionString: adminUrl }),
  db = new Client({ connectionString: url.href });
let running: Awaited<ReturnType<typeof startSystem>>;
const token = "restore-admin-credential",
  site = randomUUID(),
  product = randomUUID(),
  feature = randomUUID();
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await db.connect();
  await db.query("SET search_path TO public,pg_catalog");
  await db.query(readFileSync("database/schema.sql", "utf8"));
  await db.query(
    "INSERT INTO system_site(id,tenant_id,site_key,display_name,status) VALUES($1,'restore',$2,'Parent','active')",
    [site, site],
  );
  await db.query(
    "INSERT INTO system_product(id,product_key,name,status) VALUES($1,$2,'Parent','active')",
    [product, product],
  );
  await db.query(
    "INSERT INTO system_feature_definition(id,product_id,global_feature_key,display_name,result_contract) VALUES($1,$2,$3,'Parent','{}')",
    [feature, product, feature],
  );
  running = await startSystem({
    DATABASE_URL: url.href,
    REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
    KOKORO_SYSTEM_REDIS_NAMESPACE: name,
    KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "restore-bff-credential",
    KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "restore-agent-credential",
    KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: token,
    KOKORO_SYSTEM_PORT: "0",
  });
});
afterAll(async () => {
  await running?.close();
  await db.end();
  await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);
  await admin.end();
});
const resources = [
  {
    table: "system_site",
    path: "sites",
    sql: "INSERT INTO system_site(id,tenant_id,site_key,display_name,status,deleted_at) VALUES($1,'restore',$2,'Restore','archived',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "system_workspace",
    path: "workspaces",
    sql: "INSERT INTO system_workspace(id,tenant_id,site_id,workspace_key,name,status,deleted_at) VALUES($1,'restore',$4,$2,'Restore','archived',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "system_product",
    path: "products",
    sql: "INSERT INTO system_product(id,product_key,name,status,deleted_at) VALUES($1,$2,'Restore','archived',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "system_application",
    path: "applications",
    sql: "INSERT INTO system_application(id,tenant_id,site_id,product_id,app_key,display_name,deleted_at) VALUES($1,'restore',$4,$5,$2,'Restore',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "model_definition",
    path: "model-catalog/definitions",
    sql: "INSERT INTO model_definition(id,model_key,display_name,deleted_at) VALUES($1,$2,'Restore',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "model_provider",
    path: "model-catalog/providers",
    sql: "INSERT INTO model_provider(id,provider,provider_key,display_name,secret_handle_ref,transport,deleted_at) VALUES($1,'restore',$2,'Restore','handle','litellm',clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
  {
    table: "model_label",
    path: "model-catalog/labels",
    sql: "INSERT INTO model_label(id,label_key,display_name,feature_key,deleted_at) VALUES($1,$2,'Restore',$4,clock_timestamp()-$3::int*INTERVAL '1 day')",
  },
] as const;
const generations = async () => ({
  catalog: (
    await db.query("SELECT generation::text FROM system_catalog_generation")
  ).rows,
  tenant: (
    await db.query(
      "SELECT tenant_id,generation::text FROM system_runtime_manifest_generation ORDER BY tenant_id",
    )
  ).rows,
  model: (await db.query("SELECT generation::text FROM model_cache_generation"))
    .rows,
});
for (const resource of resources)
  for (const age of [29, 30, 31])
    it(`${resource.table} restores only before PG 30-day deadline despite application clock skew (${age} days)`, async () => {
      const id = randomUUID(),
        key = randomUUID(),
        values = [id, id, age, site, product, feature];
      if (resource.table === "model_label") values[3] = feature;
      const max = Math.max(
        ...Array.from(resource.sql.matchAll(/\$(\d+)/gu), (match) =>
          Number(match[1]),
        ),
      );
      await db.query(resource.sql, values.slice(0, max));
      const before = await generations(),
        now = Date.now();
      const skew = vi
        .spyOn(Date, "now")
        .mockReturnValue(now + (age === 29 ? 2 : -2) * 86400000);
      let response: Response;
      try {
        response = await fetch(
          `${running.url}/v1/system/${resource.path}/${id}/restore`,
          {
            method: "POST",
            headers: {
              "x-kokoro-service": "system-admin",
              authorization: `Bearer ${token}`,
              "x-kokoro-tenant-id": "restore",
              "x-kokoro-actor-id": "restore-test",
              "x-kokoro-iam-permissions": "system:write",
              "idempotency-key": key,
              "if-match": '"1"',
            },
          },
        );
      } finally {
        skew.mockRestore();
      }
      expect(response.status).toBe(age === 29 ? 200 : 409);
      const row = (
        await db.query(
          `SELECT version::text,deleted_at FROM ${resource.table} WHERE id=$1`,
          [id],
        )
      ).rows[0];
      expect(row.version).toBe(age === 29 ? "2" : "1");
      expect(row.deleted_at === null).toBe(age === 29);
      if (age === 29 && resource.table.startsWith("model_")) {
        const after = await generations();
        expect(BigInt(after.model[0].generation)).toBe(
          BigInt(before.model[0].generation) + 1n,
        );
        expect(BigInt(after.catalog[0].generation)).toBe(
          BigInt(before.catalog[0].generation) + 1n,
        );
      }
      if (age !== 29) {
        expect(await response.json()).toMatchObject({
          error: { code: "INVALID_STATE" },
        });
        expect(await generations()).toEqual(before);
        expect(
          (
            await db.query(
              "SELECT id FROM system_command_receipt WHERE idempotency_key=$1",
              [key],
            )
          ).rowCount,
        ).toBe(0);
      }
    });
it("rechecks PG wall clock after crossing cutoff within the same transaction", async () => {
  const id = randomUUID();
  await db.query(
    "INSERT INTO system_site(id,tenant_id,site_key,display_name,status,deleted_at) VALUES($1,'restore',$2,'Boundary','archived',clock_timestamp()-INTERVAL '29 days')",
    [id, id],
  );
  await expect(
    running.app.get(DatabaseService).transaction(async (tx) => {
      await tx.query(
        "UPDATE system_site SET deleted_at=clock_timestamp()-INTERVAL '30 days'+INTERVAL '50 milliseconds' WHERE id=$1",
        [id],
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      await running.app.get(SiteRepository).restore(tx, "restore", id);
    }),
  ).rejects.toMatchObject({ code: "INVALID_STATE" });
});

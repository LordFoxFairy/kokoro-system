import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { startSystem } from "../../src/start-system.js";
import { MaintenanceService } from "../../src/maintenance/maintenance.service.js";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for maintenance integration",
  );
const name = `system_g5_maintenance_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${name}`;
const admin = new Client({ connectionString: adminUrl });
const db = new Client({ connectionString: url.href });
const env = {
  DATABASE_URL: url.href,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
  KOKORO_SYSTEM_REDIS_NAMESPACE: name,
  KOKORO_SYSTEM_BFF_SERVICE_TOKEN: "maintenance-bff-token",
  KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "maintenance-agent-token",
  KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "maintenance-admin-token",
  KOKORO_SYSTEM_PORT: "0",
  KOKORO_SYSTEM_RETENTION_HOLD: "true",
};
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await db.connect();
  await db.query("SET search_path TO public,pg_catalog");
  await db.query(readFileSync("database/schema.sql", "utf8"));
});
afterAll(async () => {
  await db.end();
  await admin.query(`DROP DATABASE "${name}" WITH(FORCE)`);
  await admin.end();
});
it("holds purge but reconciles; releases expired receipts and ordinary config without identity loss", async () => {
  const receipt = randomUUID(),
    config = randomUUID(),
    product = randomUUID(),
    workspace = randomUUID();
  await db.query(
    "INSERT INTO system_command_receipt(id,scope_kind,scope_id,idempotency_key,request_hash,status,response_json,completed_at,expires_at) VALUES($1::uuid,'global','',$1::text,repeat('a',64),'completed','{}',CURRENT_TIMESTAMP-INTERVAL '8 days',CURRENT_TIMESTAMP-INTERVAL '1 day')",
    [receipt],
  );
  await db.query(
    "INSERT INTO system_config_record(id,module_key,scope_type,config_key,schema_version,value_json,status,digest,deleted_at) VALUES($1::uuid,'theme','global',$1::text,1,'{}','deleted',repeat('a',64),CURRENT_TIMESTAMP-INTERVAL '31 days')",
    [config],
  );
  await db.query(
    "INSERT INTO system_product(id,product_key,name,status,deleted_at) VALUES($1::uuid,$1::text,'Tombstone','archived',CURRENT_TIMESTAMP-INTERVAL '31 days')",
    [product],
  );
  await db.query(
    "INSERT INTO system_workspace(id,tenant_id,site_id,workspace_key,name,status) VALUES($1::uuid,'tenant', $2,$1::text,'Orphan','active')",
    [workspace, randomUUID()],
  );
  const held = await startSystem(env);
  try {
    const reuse = await fetch(`${held.url}/v1/system/products`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-kokoro-service": "system-admin",
        authorization: `Bearer ${env.KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN}`,
        "x-kokoro-actor-id": "hold-test",
        "x-kokoro-iam-permissions": "system:write",
        "idempotency-key": receipt,
      },
      body: JSON.stringify({ product_key: randomUUID(), name: "Held key" }),
    });
    expect(reuse.status).toBe(409);
    const report = await held.app.get(MaintenanceService).runOnce();
    expect(report.orphans).toBeGreaterThan(0);
    expect(report.purged).toBe(0);
  } finally {
    await held.close();
  }
  expect(
    (
      await db.query("SELECT id FROM system_command_receipt WHERE id=$1", [
        receipt,
      ])
    ).rowCount,
  ).toBe(1);
  const active = await startSystem({
    ...env,
    KOKORO_SYSTEM_RETENTION_HOLD: "false",
  });
  try {
    const report = await active.app.get(MaintenanceService).runOnce();
    expect(report.purged).toBeGreaterThanOrEqual(2);
  } finally {
    await active.close();
  }
  expect(
    (
      await db.query("SELECT id FROM system_command_receipt WHERE id=$1", [
        receipt,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await db.query("SELECT id FROM system_config_record WHERE id=$1", [
        config,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (await db.query("SELECT id FROM system_product WHERE id=$1", [product]))
      .rowCount,
  ).toBe(1);
  expect(
    (await db.query("SELECT id FROM system_workspace WHERE id=$1", [workspace]))
      .rowCount,
  ).toBe(1);
});
it("schedules retention and drains its timer, retaining recent resources and held bindings", async () => {
  const expiredSite = randomUUID(),
    recentSite = randomUUID(),
    blockedSite = randomUUID(),
    child = randomUUID(),
    release = randomUUID(),
    recentRelease = randomUUID(),
    boundRelease = randomUUID(),
    product = randomUUID(),
    binding = randomUUID();
  for (const [id, age] of [
    [expiredSite, 31],
    [recentSite, 29],
    [blockedSite, 31],
  ] as const)
    await db.query(
      "INSERT INTO system_site(id,tenant_id,site_key,display_name,status,deleted_at) VALUES($1,'retention',$2,'Site','archived',CURRENT_TIMESTAMP-($3::int*INTERVAL '1 day'))",
      [id, id, age],
    );
  await db.query(
    "INSERT INTO system_workspace(id,tenant_id,site_id,workspace_key,name,status,deleted_at) VALUES($1,'retention',$2,$3,'Recent child','archived',CURRENT_TIMESTAMP-INTERVAL '29 days')",
    [child, blockedSite, child],
  );
  await db.query(
    "INSERT INTO system_product(id,product_key,name,status) VALUES($1,$2,'Product','active')",
    [product, product],
  );
  for (const [id, age] of [
    [release, 91],
    [recentRelease, 89],
    [boundRelease, 91],
  ] as const)
    await db.query(
      "INSERT INTO system_config_release(id,tenant_id,release_key,status,digest,updated_at) VALUES($1,'retention',$2,'retired',repeat('a',64),CURRENT_TIMESTAMP-($3::int*INTERVAL '1 day'))",
      [id, id, age],
    );
  await db.query(
    "INSERT INTO system_release_binding(id,tenant_id,scope_type,scope_id,product_id,release_id,status) VALUES($1,'retention','tenant','retention',$2,$3,'archived')",
    [binding, product, boundRelease],
  );
  const active = await startSystem({
    ...env,
    KOKORO_SYSTEM_RETENTION_HOLD: "false",
    KOKORO_SYSTEM_MAINTENANCE_INTERVAL_MS: "100",
  });
  try {
    const deadline = Date.now() + 2000;
    while (
      (await db.query("SELECT id FROM system_site WHERE id=$1", [expiredSite]))
        .rowCount &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      (await db.query("SELECT id FROM system_site WHERE id=$1", [expiredSite]))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await db.query("SELECT id FROM system_site WHERE id=ANY($1::uuid[])", [
          [recentSite, blockedSite],
        ])
      ).rowCount,
    ).toBe(2);
    expect(
      (
        await db.query("SELECT id FROM system_config_release WHERE id=$1", [
          release,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT id FROM system_config_release WHERE id=ANY($1::uuid[])",
          [[recentRelease, boundRelease]],
        )
      ).rowCount,
    ).toBe(2);
  } finally {
    await active.close();
  }
  await expect(active.app.get(MaintenanceService).runOnce()).rejects.toThrow(
    "draining",
  );
});
it("reconciles every stored relationship without repairing or deleting immutable facts", async () => {
  const running = await startSystem(env);
  try {
    const maintenance = running.app.get(MaintenanceService);
    const cases = [
      "INSERT INTO system_site_host(id,site_id,tenant_id,hostname,status) VALUES($1,$2,'orphan',$3,'active')",
      "INSERT INTO system_site_policy(id,site_id,tenant_id,status,default_locale,allowed_locales_json,allowed_products_json) VALUES($1,$2,'orphan','active','en','[\"en\"]','[]')",
      "INSERT INTO system_application(id,site_id,product_id,tenant_id,app_key,display_name) VALUES($1,$2,$2,'orphan',$3,'Orphan')",
      "INSERT INTO system_feature_definition(id,product_id,global_feature_key,display_name,result_contract) VALUES($1,$2,$3,'Orphan','{}')",
      "INSERT INTO system_app_feature_exposure(id,tenant_id,application_id,feature_id,enabled) VALUES($1,'orphan',$2,$2,true)",
      "INSERT INTO system_presentation(id,tenant_id,application_id,locale,navigation,theme,locale_namespaces) VALUES($1,'orphan',$2,'en','[]','{}','[]')",
      "INSERT INTO system_config_record(id,tenant_id,product_id,module_key,scope_type,scope_id,config_key,schema_version,value_json,status,digest) VALUES($1,'orphan',$2::uuid,'theme','product',$2::text,$3,1,'{}','active',repeat('a',64))",
      "INSERT INTO system_release_binding(id,tenant_id,product_id,release_id,scope_type,scope_id,status) VALUES($1,'orphan',$2,$2,'tenant','orphan','active')",
      "INSERT INTO model_label(id,label_key,display_name,feature_key,default_revision_id) VALUES($1,$3,'Orphan',$3,$2)",
      "INSERT INTO model_revision(id,model_id,provider_id,revision,provider_model_name,display_name,feature_key,input_modalities,output_modalities,transport,gateway_model_name,digest) VALUES($1,$2,$2,1,'model','Orphan',$3,'[]','[]','litellm','model',repeat('a',64))",
      "INSERT INTO model_routing_policy(id,tenant_id,label_id,feature_key,model_revision_id,visible) VALUES($1,'orphan',$2,$3,$2,true)",
      "INSERT INTO model_provider_health_state(provider_id,status,observed_at) VALUES($1,'healthy',CURRENT_TIMESTAMP)",
    ];
    for (const sql of cases) {
      const before = (await maintenance.runOnce()).orphans;
      const values = [randomUUID(), randomUUID(), randomUUID()];
      const max = Math.max(
        ...Array.from(sql.matchAll(/\$(\d+)/gu), (match) => Number(match[1])),
      );
      await db.query(sql, values.slice(0, max));
      expect((await maintenance.runOnce()).orphans, sql).toBeGreaterThan(
        before,
      );
    }
    const plans = await db.query<{ "QUERY PLAN": unknown[] }>(
      "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM system_command_receipt WHERE status='completed' AND expires_at<CURRENT_TIMESTAMP ORDER BY expires_at,id LIMIT 1000",
    );
    expect(plans.rows[0]?.["QUERY PLAN"][0]).toHaveProperty("Execution Time");
    expect(
      (
        await db.query(
          "SELECT id FROM model_revision WHERE display_name='Orphan'",
        )
      ).rowCount,
    ).toBe(1);
  } finally {
    await running.close();
  }
});
it("does not flag a deleted label's retained retired revision as a live orphan", async () => {
  const ids = Array.from({ length: 6 }, () => randomUUID());
  const [product, feature, model, provider, revision, label] = ids;
  const running = await startSystem(env);
  try {
    const maintenance = running.app.get(MaintenanceService),
      before = (await maintenance.runOnce()).orphans;
    await db.query(
      "INSERT INTO system_product(id,product_key,name,status) VALUES($1,$2,'Retained','active')",
      [product, product],
    );
    await db.query(
      "INSERT INTO system_feature_definition(id,product_id,global_feature_key,display_name,result_contract) VALUES($1,$2,$3,'Retained','{}')",
      [feature, product, feature],
    );
    await db.query(
      "INSERT INTO model_definition(id,model_key,display_name) VALUES($1,$2,'Retained')",
      [model, model],
    );
    await db.query(
      "INSERT INTO model_provider(id,provider,provider_key,display_name,secret_handle_ref,transport) VALUES($1,'retained',$2,'Retained','handle','litellm')",
      [provider, provider],
    );
    await db.query(
      "INSERT INTO model_revision(id,model_id,provider_id,revision,provider_model_name,display_name,feature_key,input_modalities,output_modalities,transport,gateway_model_name,digest,published_at,retired_at) VALUES($1,$2,$3,1,'retained','Retained',$4,'[]','[]','litellm','retained',repeat('a',64),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",
      [revision, model, provider, feature],
    );
    await db.query(
      "INSERT INTO model_label(id,label_key,display_name,feature_key,default_revision_id,deleted_at) VALUES($1,$2,'Retained',$3,$4,CURRENT_TIMESTAMP)",
      [label, label, feature, revision],
    );
    expect((await maintenance.runOnce()).orphans).toBe(before);
  } finally {
    await running.close();
  }
});

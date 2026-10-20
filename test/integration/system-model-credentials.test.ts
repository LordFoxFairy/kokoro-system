import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureHttp } from "../../src/http/configure-http.js";
import { parseSystemDatabaseUrl } from "../../src/config/database-url.js";
import { ModelMaintenanceService } from "../../src/modules/model-catalog/model-maintenance.service.js";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for real credential integration",
  );
const databaseName = `system_credential_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${databaseName}`;
url.searchParams.set("schema", "credential_fixture");
const admin = new Client({ connectionString: adminUrl }),
  db = new Client(parseSystemDatabaseUrl(url.href));
const directory = mkdtempSync(join(tmpdir(), "kokoro-credential-http-")),
  materialFile = join(directory, "material.json");
writeFileSync(
  materialFile,
  JSON.stringify({
    encryption_key: randomBytes(32).toString("base64"),
    idempotency_hmac_key: randomBytes(32).toString("base64"),
  }),
  { mode: 0o600 },
);
let app: NestExpressApplication, base: string;
const tokens = {
  "system-admin": "fixture-system-administrator",
  "model-management": "fixture-model-management-token",
  "kokoro-agent": "fixture-agent-credential-token",
  "web-bff": "fixture-bff-credential-token",
};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  options: {
    service?: keyof typeof tokens;
    key?: string;
    tenant?: string;
    actor?: string;
    match?: string;
    none?: string;
  } = {},
) {
  const service = options.service ?? "model-management";
  const response = await fetch(`${base}/v1/system/${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokens[service]}`,
      "x-kokoro-service": service,
      "x-kokoro-tenant-id": options.tenant ?? "tenant-a",
      "x-kokoro-actor-id": options.actor ?? "actor-a",
      ...(service === "kokoro-agent"
        ? {}
        : {
            "x-kokoro-iam-permissions":
              "system:read,system:write,system:publish",
          }),
      "x-request-id": "credential-integration",
      ...(method === "GET"
        ? {}
        : { "idempotency-key": options.key ?? randomUUID() }),
      ...(options.match ? { "if-match": options.match } : {}),
      ...(options.none ? { "if-none-match": options.none } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    response,
    body: (await response.json()) as {
      data: Record<string, unknown>;
      error?: { code: string };
    },
  };
}
function providerInput() {
  return {
    provider: "fixture",
    provider_key: randomUUID(),
    display_name: "Shared connection",
    protocol: "openai_chat_completions",
    base_url: "https://fixture.invalid/v1",
    priority: 0,
    api_key: "fixture-key-never-sent-to-model",
  };
}
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await db.connect();
  await db.query(
    "CREATE SCHEMA credential_fixture; SET search_path TO credential_fixture,pg_catalog",
  );
  await db.query(readFileSync("database/schema.sql", "utf8"));
  app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({
      DATABASE_URL: url.href,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/6",
      KOKORO_SYSTEM_REDIS_NAMESPACE: databaseName,
      KOKORO_SYSTEM_MODEL_KEY_MATERIAL_FILE: materialFile,
      KOKORO_SYSTEM_MODEL_MANAGEMENT_SERVICE_TOKEN: tokens["model-management"],
      KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: tokens["system-admin"],
      KOKORO_SYSTEM_BFF_SERVICE_TOKEN: tokens["web-bff"],
      KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: tokens["kokoro-agent"],
      KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS: "300000",
    }),
    { logger: false },
  );
  configureHttp(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
});
describe("model credentials real HTTP/PostgreSQL (zero model requests)", () => {
  it("releases a key only for the current authorized business selection and exact revision", async () => {
    const input = providerInput(),
      provider = await request("model-catalog/providers", "POST", input);
    expect(provider.response.status).toBe(201);
    async function create(
      path: string,
      body: unknown,
      service: keyof typeof tokens = "model-management",
    ) {
      const result = await request(path, "POST", body, { service });
      expect(result.response.status).toBe(201);
      return result.body.data;
    }
    const product = await create(
      "products",
      { product_key: randomUUID(), name: "Credential route" },
      "system-admin",
    );
    const feature = "credential." + randomUUID();
    await create(
      "features",
      {
        global_feature_key: feature,
        product_id: product.id,
        display_name: "Credential route",
        result_contract: {
          schema_version: 1,
          outcome_kind: "message",
          media_types: [],
          required_fields: [],
        },
      },
      "system-admin",
    );
    const model = await create("model-catalog/definitions", {
      model_key: randomUUID(),
      display_name: "Shared model",
    });
    const revisionInput = {
      model_id: model.id,
      provider_id: provider.body.data.id,
      revision: 1,
      provider_model_name: "fixture-model",
      request_model: "fixture-model",
      display_name: "Shared model",
      input_modalities: ["text"],
      output_modalities: ["text"],
      context_window: 8192,
      max_output_tokens: 2048,
      priority: 0,
    };
    const revision = await create("model-catalog/revisions", revisionInput);
    const published = await request(
      `model-catalog/revisions/${String(revision.id)}/publish`,
      "POST",
      undefined,
      { match: '"1"' },
    );
    expect(published.response.status).toBe(200);
    const label = await create("model-catalog/labels", {
      label_key: "choice/" + randomUUID(),
      feature_key: feature,
      default_revision_id: revision.id,
    });
    const route = {
      model_revision_id: null,
      visible: true,
      is_default: true,
      priority: 0,
    };
    expect(
      (
        await request(
          `model-catalog/routing-policies/${String(label.id)}`,
          "PUT",
          route,
          { service: "web-bff", none: "*" },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/providers/${String(provider.body.data.id)}/health`,
          "PUT",
          { status: "healthy", observed_at: new Date().toISOString() },
          { service: "system-admin", none: "*" },
        )
      ).response.status,
    ).toBe(200);
    const binding = {
      feature_key: feature,
      provider_id: provider.body.data.id,
      revision_id: revision.id,
      digest: published.body.data.digest,
    };
    const result = await request(
      "model-catalog/credentials/read",
      "POST",
      binding,
      { service: "kokoro-agent" },
    );
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.body.data).toMatchObject({
      ...binding,
      label_key: label.label_key,
      api_key: input.api_key,
      secret_handle_ref: provider.body.data.secret_handle_ref,
    });
    for (const service of [
      "web-bff",
      "model-management",
      "system-admin",
    ] as const)
      expect(
        (
          await request("model-catalog/credentials/read", "POST", binding, {
            service,
          })
        ).response.status,
      ).toBe(403);
    expect(
      (
        await request("model-catalog/credentials/read", "POST", binding, {
          service: "kokoro-agent",
          tenant: "tenant-b",
        })
      ).response.status,
    ).toBe(503);
    expect(
      (
        await request(
          "model-catalog/credentials/read",
          "POST",
          { ...binding, digest: "0".repeat(64) },
          { service: "kokoro-agent" },
        )
      ).response.status,
    ).toBe(503);
    const second = await create("model-catalog/revisions", {
      ...revisionInput,
      revision: 2,
    });
    const next = await request(
      `model-catalog/revisions/${String(second.id)}/publish`,
      "POST",
      undefined,
      { match: '"1"' },
    );
    expect(next.response.status).toBe(200);
    expect(
      (
        await request(
          `model-catalog/routing-policies/${String(label.id)}`,
          "PUT",
          { ...route, model_revision_id: second.id },
          { service: "web-bff", match: '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request("model-catalog/credentials/read", "POST", binding, {
          service: "kokoro-agent",
        })
      ).response.status,
    ).toBe(503);
    expect(
      (
        await request(
          "model-catalog/credentials/read",
          "POST",
          { ...binding, revision_id: second.id, digest: next.body.data.digest },
          { service: "kokoro-agent" },
        )
      ).response.status,
    ).toBe(200);

    const currentBinding = {
      ...binding,
      revision_id: second.id,
      digest: next.body.data.digest,
    };
    for (const mismatched of [
      { ...currentBinding, provider_id: randomUUID() },
      { ...currentBinding, label_key: "missing-choice" },
    ])
      expect(
        (
          await request("model-catalog/credentials/read", "POST", mismatched, {
            service: "kokoro-agent",
          })
        ).response.status,
      ).toBe(503);
    for (const invalid of [
      "nonce=decode('00','hex')",
      "ciphertext=NULL",
      "erased_at=clock_timestamp()",
    ])
      await expect(
        db.query(
          `UPDATE model_provider_credential SET ${invalid} WHERE provider_id=$1`,
          [binding.provider_id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    const original = (
      await db.query<{ ciphertext: Buffer }>(
        "SELECT ciphertext FROM model_provider_credential WHERE provider_id=$1",
        [binding.provider_id],
      )
    ).rows[0]!.ciphertext;
    const tampered = Buffer.from(original);
    tampered[0] = tampered[0]! ^ 1;
    await db.query(
      "UPDATE model_provider_credential SET ciphertext=$2 WHERE provider_id=$1",
      [binding.provider_id, tampered],
    );
    const rejected = await request(
      "model-catalog/credentials/read",
      "POST",
      currentBinding,
      { service: "kokoro-agent" },
    );
    expect(rejected.response.status).toBe(503);
    expect(JSON.stringify(rejected.body)).not.toContain(input.api_key);
    await db.query(
      "UPDATE model_provider_credential SET ciphertext=$2 WHERE provider_id=$1",
      [binding.provider_id, original],
    );
    await db.query(
      "UPDATE model_provider_health_state SET observed_at=clock_timestamp()-INTERVAL '301 seconds' WHERE provider_id=$1",
      [binding.provider_id],
    );
    expect(
      (
        await request(
          "model-catalog/credentials/read",
          "POST",
          currentBinding,
          { service: "kokoro-agent" },
        )
      ).response.status,
    ).toBe(503);
    await db.query(
      "UPDATE model_provider_health_state SET observed_at=clock_timestamp() WHERE provider_id=$1",
      [binding.provider_id],
    );
    // A read already waiting for the provider lock must not reuse pre-wait
    // policy authority. Observe the actual PG lock waiter, then revoke and commit.
    let holding = true,
      pending: ReturnType<typeof request> | undefined;
    await db.query("BEGIN");
    try {
      await db.query("SELECT id FROM model_provider WHERE id=$1 FOR UPDATE", [
        binding.provider_id,
      ]);
      pending = request(
        "model-catalog/credentials/read",
        "POST",
        currentBinding,
        { service: "kokoro-agent" },
      );
      let waiting = false;
      const deadline = Date.now() + 2000;
      while (!waiting && Date.now() < deadline) {
        waiting = (
          await admin.query<{ waiting: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock') AS waiting",
            [databaseName],
          )
        ).rows[0]!.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await db.query(
        "UPDATE model_routing_policy SET visible=false WHERE tenant_id='tenant-a' AND label_id=$1",
        [label.id],
      );
      await db.query("COMMIT");
      holding = false;
      expect((await pending).response.status).toBe(503);
    } finally {
      if (holding) await db.query("ROLLBACK");
      await pending?.catch(() => undefined);
    }
  });

  it("creates once, persists no plaintext, checks actor tenant on replay and recovers after receipt expiry", async () => {
    const input = providerInput(),
      key = randomUUID();
    const [a, b] = await Promise.all([
      request("model-catalog/providers", "POST", input, { key }),
      request("model-catalog/providers", "POST", input, { key }),
    ]);
    expect(a.response.status).toBe(201);
    expect(b.response.status).toBe(201);
    expect(a.body).toEqual(b.body);
    expect(JSON.stringify(a.body)).not.toContain(input.api_key);
    const raw = await db.query<{ row: string }>(
      "SELECT to_jsonb(c)::text AS row FROM model_provider_credential c WHERE provider_id=$1",
      [a.body.data.id],
    );
    expect(raw.rowCount).toBe(1);
    expect(raw.rows[0]!.row).not.toContain(input.api_key);
    const receipt = await db.query<{ row: string }>(
      "SELECT to_jsonb(r)::text AS row FROM system_command_receipt r WHERE idempotency_key=$1",
      [key],
    );
    expect(receipt.rows[0]!.row).not.toContain(input.api_key);
    expect(
      (
        await request("model-catalog/providers", "POST", input, {
          key,
          tenant: "tenant-b",
        })
      ).response.status,
    ).toBe(409);
    const path = "model-catalog/provider-creations?idempotency_key=" + key;
    expect((await request(path)).body.data).toMatchObject({
      provider_id: a.body.data.id,
      credential_status: "stored",
      deleted_at: null,
    });
    expect(
      (await request(path, "GET", undefined, { actor: "other" })).response
        .status,
    ).toBe(404);
    await db.query(
      "DELETE FROM system_command_receipt WHERE idempotency_key=$1",
      [key],
    );
    expect(
      (await request("model-catalog/providers", "POST", input, { key }))
        .response.status,
    ).toBe(409);
    expect((await request(path)).body.data.provider_id).toBe(a.body.data.id);
  });
  it("rolls back provider, generation, marker and receipt together when credential insertion fails", async () => {
    const input = providerInput(),
      key = randomUUID();
    const before = await db.query(
      "SELECT generation FROM model_cache_generation",
    );
    await db.query(
      "CREATE FUNCTION credential_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture insertion fault'; END $$; CREATE TRIGGER credential_test_failure BEFORE INSERT ON model_provider_credential FOR EACH ROW EXECUTE FUNCTION credential_test_failure()",
    );
    try {
      expect(
        (await request("model-catalog/providers", "POST", input, { key }))
          .response.status,
      ).toBe(503);
    } finally {
      await db.query(
        "DROP TRIGGER credential_test_failure ON model_provider_credential; DROP FUNCTION credential_test_failure()",
      );
    }
    expect(
      (
        await db.query("SELECT id FROM model_provider WHERE provider_key=$1", [
          input.provider_key,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT provider_id FROM model_provider_credential WHERE creation_key=$1",
          [key],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db.query(
          "SELECT id FROM system_command_receipt WHERE idempotency_key=$1",
          [key],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await db.query("SELECT generation FROM model_cache_generation")).rows,
    ).toEqual(before.rows);
  });
  it("erases only expired ciphertext while preserving creation identity and a truthful recovery result", async () => {
    const input = providerInput(),
      key = randomUUID();
    const created = await request("model-catalog/providers", "POST", input, {
      key,
    });
    expect(created.response.status).toBe(201);
    const id = String(created.body.data.id);
    expect(
      (
        await request(`model-catalog/providers/${id}`, "DELETE", undefined, {
          match: '"1"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/providers/${id}/restore`,
          "POST",
          undefined,
          { match: '"2"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`model-catalog/providers/${id}`, "DELETE", undefined, {
          match: '"3"',
        })
      ).response.status,
    ).toBe(200);
    await db.query(
      "UPDATE model_provider SET deleted_at=clock_timestamp()-INTERVAL '31 days' WHERE id=$1",
      [id],
    );
    await app.get(ModelMaintenanceService).maintain(true);
    expect(
      (
        await request(
          `model-catalog/providers/${id}/restore`,
          "POST",
          undefined,
          { match: '"4"' },
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await db.query<{ retained: boolean }>(
          "SELECT ciphertext IS NOT NULL AS retained FROM model_provider_credential WHERE provider_id=$1",
          [id],
        )
      ).rows[0]?.retained,
    ).toBe(true);
    await app.get(ModelMaintenanceService).maintain(false);
    expect(
      (
        await db.query(
          "SELECT ciphertext,nonce,auth_tag,creation_key FROM model_provider_credential WHERE provider_id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({
      ciphertext: null,
      nonce: null,
      auth_tag: null,
      creation_key: key,
    });
    expect(
      (await request("model-catalog/provider-creations?idempotency_key=" + key))
        .body.data,
    ).toMatchObject({ provider_id: id, credential_status: "erased" });
  });
});

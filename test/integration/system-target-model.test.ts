import { revisionSchema } from "../../src/modules/model-catalog/schemas/revision.schema.js";
import { revisionContent } from "../../src/modules/model-catalog/revision-content.js";
import { parseSystemDatabaseUrl } from "../../src/config/database-url.js";
import { ModelGenerationRepository } from "../../src/modules/model-catalog/model-generation.repository.js";
import { CacheService } from "../../src/cache/cache.service.js";
import { commandDigest } from "../../src/database/command-digest.js";
import { systemOperations } from "../../scripts/system-openapi-operations.js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "../../src/app.module.js";
import { configureHttp } from "../../src/http/configure-http.js";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for real System target integration",
  );
const databaseName = `system_g4_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: adminUrl });
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
databaseUrl.searchParams.set("schema", "system_fixture");
let app: NestExpressApplication;
let base: string;
const token = "system-test-bff-credential";
const actor = "actor-opaque";
function headers(tenant = "tenant-a", extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    "x-kokoro-service": "web-bff",
    authorization: `Bearer ${token}`,
    "x-kokoro-tenant-id": tenant,
    "x-kokoro-actor-id": actor,
    "x-kokoro-iam-permissions": "system:read,system:write,system:publish",
    "x-request-id": "integration:opaque-request",
    "idempotency-key": randomUUID(),
    ...extra,
  };
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
  tenant = "tenant-a",
  target = base,
) {
  const response = await fetch(`${target}/v1/system/${path}`, {
    method,
    headers: Object.fromEntries(
      Object.entries(headers(tenant, extra)).filter(
        ([, value]) => value !== "",
      ),
    ),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = (await response.json()) as {
    data?: Record<string, unknown>;
    error?: { code: string; retryable: boolean };
  };
  expect(response.headers.get("x-request-id")).toBe(
    "integration:opaque-request",
  );
  expect(json).not.toHaveProperty("meta");
  return { response, json };
}
beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const schema = new Client(parseSystemDatabaseUrl(databaseUrl.href));
  await schema.connect();
  try {
    await schema.query("CREATE SCHEMA system_fixture");
    await schema.query("SET search_path TO system_fixture,pg_catalog");
    await schema.query(readFileSync("database/schema.sql", "utf8"));
  } finally {
    await schema.end();
  }
  app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({
      DATABASE_URL: databaseUrl.href,
      KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS: "2000",
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
      KOKORO_SYSTEM_REDIS_NAMESPACE: databaseName,
      KOKORO_SYSTEM_BFF_SERVICE_TOKEN: token,
      KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "system-test-agent-credential",
      KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "system-test-admin-credential",
    }),
    { logger: false },
  );
  configureHttp(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.end();
});

const adminHeaders = {
  "x-kokoro-service": "system-admin",
  authorization: "Bearer system-test-admin-credential",
};
const agentHeaders = {
  "x-kokoro-service": "kokoro-agent",
  authorization: "Bearer system-test-agent-credential",
  "x-kokoro-iam-permissions": "",
};
async function seedRoute(
  connection = {
    connection_type: "litellm",
    base_url: "https://gateway.example/v1",
    secret_handle_ref: "vault:route",
  },
  target = base,
) {
  const call = (
    path: string,
    method = "GET",
    body?: unknown,
    extra: Record<string, string> = {},
  ) => request(path, method, body, extra, "tenant-a", target);
  const suffix = randomUUID(),
    feature = `feature.${suffix}`;
  const product = await call(
    "products",
    "POST",
    { product_key: suffix, name: "Route" },
    adminHeaders,
  );
  const f = await call(
    "features",
    "POST",
    {
      global_feature_key: feature,
      product_id: product.json.data?.id,
      display_name: "Route",
      result_contract: {
        schema_version: 1,
        outcome_kind: "message",
        media_types: [],
        required_fields: [],
      },
    },
    adminHeaders,
  );
  expect(f.response.status).toBe(201);
  const model = await call(
    "model-catalog/definitions",
    "POST",
    { model_key: suffix, display_name: "Route" },
    adminHeaders,
  );
  const provider = await call(
      "model-catalog/providers",
      "POST",
      {
        provider: "litellm",
        provider_key: suffix,
        display_name: "Route",
        protocol: "openai_chat_completions",
        ...connection,
        priority: 1,
      },
      adminHeaders,
    ),
    pid = String(provider.json.data?.id);
  const revision = await call(
      "model-catalog/revisions",
      "POST",
      {
        model_id: model.json.data?.id,
        provider_id: pid,
        revision: 1,
        provider_model_name: "provider",
        display_name: "Route",
        input_modalities: ["text"],
        output_modalities: ["text"],

        request_model: "gateway",
        context_window: 8192,
        max_output_tokens: 2048,
        priority: 1,
      },
      adminHeaders,
    ),
    rid = String(revision.json.data?.id);
  expect(revision.response.status).toBe(201);
  expect(
    (
      await call(`model-catalog/revisions/${rid}/publish`, "POST", undefined, {
        ...adminHeaders,
        "if-match": '"1"',
      })
    ).response.status,
  ).toBe(200);
  const label = await call(
      "model-catalog/labels",
      "POST",
      {
        label_key: suffix,
        display_name: "Route",
        feature_key: feature,
        default_revision_id: rid,
      },
      adminHeaders,
    ),
    lid = String(label.json.data?.id);
  expect(label.response.status).toBe(201);
  expect(
    (
      await call(
        `model-catalog/routing-policies/${lid}`,
        "PUT",
        {
          model_revision_id: null,
          visible: true,
          is_default: true,
          priority: 0,
        },
        { "if-none-match": "*" },
      )
    ).response.status,
  ).toBe(200);
  return {
    feature,
    pid,
    rid,
    lid,
    modelId: String(model.json.data?.id),
    featureId: String(f.json.data?.id),
  };
}
describe("real Nest Model catalog", () => {
  it("shares one immutable revision across businesses with explicit tenant choices and optional aliases", async () => {
    const first = await seedRoute();
    const second = await seedRoute();
    const frozen = (
      await request(
        `model-catalog/revisions/${first.rid}`,
        "GET",
        undefined,
        adminHeaders,
      )
    ).json.data;
    const shared = await request(
      `model-catalog/labels/${second.lid}`,
      "PATCH",
      { default_revision_id: first.rid },
      { ...adminHeaders, "if-match": '"1"' },
    );
    expect(shared.response.status).toBe(200);
    expect(shared.json.data?.display_name).toBe("Route");
    expect(
      (
        await request(
          `model-catalog/labels/${second.lid}`,
          "PATCH",
          { display_name: "Titles" },
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/labels/${first.lid}`,
          "PATCH",
          { display_name: null },
          { ...adminHeaders, "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/routing-policies/${second.lid}`,
          "PUT",
          {
            model_revision_id: second.rid,
            visible: true,
            is_default: true,
            priority: 0,
          },
          { "if-none-match": "*" },
          "tenant-b",
        )
      ).response.status,
    ).toBe(200);
    for (const provider of [first.pid, second.pid]) {
      expect(
        (
          await request(
            `model-catalog/providers/${provider}/health`,
            "PUT",
            { status: "healthy", observed_at: new Date().toISOString() },
            { ...adminHeaders, "if-none-match": "*" },
          )
        ).response.status,
      ).toBe(200);
    }
    const catalog = async (feature: string, tenant = "tenant-a") => {
      const result = await request(
        `model-catalog/catalog?feature_key=${encodeURIComponent(feature)}`,
        "GET",
        undefined,
        {},
        tenant,
      );
      expect(result.response.status).toBe(200);
      return result.json.data?.items as Array<Record<string, unknown>>;
    };
    expect(await catalog(first.feature)).toEqual([
      expect.objectContaining({
        revision_id: first.rid,
        provider_id: first.pid,
        display_name: "gateway",
        request_model: "gateway",
        is_default: true,
      }),
    ]);
    expect(await catalog(second.feature)).toEqual([
      expect.objectContaining({
        revision_id: first.rid,
        provider_id: first.pid,
        display_name: "Titles",
      }),
    ]);
    expect(await catalog(second.feature, "tenant-b")).toEqual([
      expect.objectContaining({
        revision_id: second.rid,
        provider_id: second.pid,
        display_name: "Titles",
      }),
    ]);
    expect(await catalog(first.feature, "tenant-b")).toEqual([]);
    for (const feature of [first.feature, second.feature]) {
      const resolved = await request(
        "model-catalog/resolve",
        "POST",
        { feature_key: feature },
        agentHeaders,
      );
      expect(resolved.response.status).toBe(200);
      expect(resolved.json.data).toMatchObject({
        revision_id: first.rid,
        provider_id: first.pid,
        feature_key: feature,
        request_model: "gateway",
      });
    }
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: second.feature },
          agentHeaders,
          "tenant-b",
        )
      ).json.data,
    ).toMatchObject({
      revision_id: second.rid,
      provider_id: second.pid,
    });
    expect(
      (
        await request(
          `model-catalog/labels/${second.lid}`,
          "PATCH",
          { display_name: null },
          { ...adminHeaders, "if-match": '"3"' },
        )
      ).response.status,
    ).toBe(200);
    expect((await catalog(second.feature))[0]?.display_name).toBe("gateway");
    const unboundKey = `unbound.${randomUUID()}`;
    const unbound = await request(
      "model-catalog/labels",
      "POST",
      {
        label_key: unboundKey,
        feature_key: second.feature,
        default_revision_id: null,
      },
      adminHeaders,
    );
    expect(unbound.response.status).toBe(201);
    expect(
      (
        await request(
          `model-catalog/routing-policies/${String(unbound.json.data?.id)}`,
          "PUT",
          {
            model_revision_id: null,
            visible: true,
            is_default: false,
            priority: 0,
          },
          { "if-none-match": "*" },
        )
      ).response.status,
    ).toBe(200);
    expect(await catalog(second.feature)).toHaveLength(1);
    const rejected = await request(
      "model-catalog/resolve",
      "POST",
      { feature_key: second.feature, label_key: unboundKey },
      agentHeaders,
    );
    expect(rejected.response.status).toBe(503);
    expect(rejected.json.error?.code).toBe("MODEL_UNAVAILABLE");
    expect(
      (
        await request(
          `model-catalog/revisions/${first.rid}`,
          "GET",
          undefined,
          adminHeaders,
        )
      ).json.data,
    ).toEqual(frozen);
    expect(frozen).not.toHaveProperty("feature_key");
    expect(
      (
        await request(
          `model-catalog/routing-policies/${first.lid}`,
          "DELETE",
          undefined,
          { "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/labels/${first.lid}`,
          "DELETE",
          undefined,
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`features/${first.featureId}/retire`, "POST", undefined, {
          ...adminHeaders,
          "if-match": '"1"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: second.feature },
          agentHeaders,
        )
      ).json.data?.revision_id,
    ).toBe(first.rid);
    const stillUsed = await request(
      `model-catalog/revisions/${first.rid}/retire`,
      "POST",
      undefined,
      { ...adminHeaders, "if-match": '"2"' },
    );
    expect(stillUsed.response.status).toBe(409);
    expect(stillUsed.json.error?.code).toBe("RESOURCE_IN_USE");
  });
  it("owns definition/provider global CRUD and health CAS", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const def = await request(
      "model-catalog/definitions",
      "POST",
      { model_key: "assistant", display_name: "Assistant" },
      ah,
    );
    expect(def.response.status).toBe(201);
    const id = String(def.json.data?.id);
    expect(
      (
        await request(
          `model-catalog/definitions/${id}`,
          "PATCH",
          { display_name: "Changed" },
          { ...ah, "if-match": '"1"' },
        )
      ).json.data?.version,
    ).toBe("2");
    expect(
      (
        await request(`model-catalog/definitions/${id}`, "DELETE", undefined, {
          ...ah,
          "if-match": '"2"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/definitions/${id}/restore`,
          "POST",
          undefined,
          { ...ah, "if-match": '"3"' },
        )
      ).json.data?.version,
    ).toBe("4");
    const provider = await request(
      "model-catalog/providers",
      "POST",
      {
        provider: "litellm",
        provider_key: "primary",
        display_name: "Primary",
        secret_handle_ref: "vault:primary",
        protocol: "openai_chat_completions",
        connection_type: "litellm",
        base_url: "https://gateway.example/v1",
        priority: 10,
      },
      ah,
    );
    expect(provider.response.status).toBe(201);
    const pid = String(provider.json.data?.id);
    const health = await request(
      `model-catalog/providers/${pid}/health`,
      "PUT",
      { status: "healthy", observed_at: new Date().toISOString() },
      { ...ah, "if-none-match": "*" },
    );
    expect(health.response.status).toBe(200);
    expect(health.json.data?.generation).toBe("1");
  });
  it("publishes immutable revisions and validates labels/default references", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "model", name: "Model" },
      ah,
    );
    await request(
      "features",
      "POST",
      {
        global_feature_key: "model.chat",
        product_id: product.json.data?.id,
        display_name: "Chat",
        result_contract: {
          schema_version: 1,
          outcome_kind: "message",
          media_types: [],
          required_fields: [],
        },
      },
      ah,
    );
    const model = await request(
      "model-catalog/definitions",
      "POST",
      { model_key: "revision-model", display_name: "Revision" },
      ah,
    );
    const provider = await request(
      "model-catalog/providers",
      "POST",
      {
        provider: "litellm",
        provider_key: "revision-provider",
        display_name: "Provider",
        secret_handle_ref: "vault:revision",
        protocol: "openai_chat_completions",
        connection_type: "litellm",
        base_url: "https://gateway.example/v1",
        priority: 1,
      },
      ah,
    );
    const input = {
      model_id: model.json.data?.id,
      provider_id: provider.json.data?.id,
      revision: 1,
      provider_model_name: "provider-model",
      display_name: "Revision",
      input_modalities: ["text"],
      output_modalities: ["text"],

      request_model: "gateway-model",
      context_window: 8000,
      max_output_tokens: 2000,
      priority: 10,
    };
    const revision = await request(
      "model-catalog/revisions",
      "POST",
      input,
      ah,
    );
    expect(revision.response.status).toBe(201);
    const rid = String(revision.json.data?.id);
    expect(
      (
        await request(
          "model-catalog/labels",
          "POST",
          {
            label_key: "draft-label",
            display_name: "Draft",
            feature_key: "model.chat",
            default_revision_id: rid,
          },
          ah,
        )
      ).response.status,
    ).toBe(409);
    const published = await request(
      `model-catalog/revisions/${rid}/publish`,
      "POST",
      undefined,
      { ...ah, "if-match": '"1"' },
    );
    expect(published.response.status).toBe(200);
    expect(
      (
        await request(
          `model-catalog/revisions/${rid}`,
          "PATCH",
          { priority: 20 },
          { ...ah, "if-match": '"2"' },
        )
      ).json.error?.code,
    ).toBe("INVALID_STATE");
    const label = await request(
      "model-catalog/labels",
      "POST",
      {
        label_key: "default-label",
        display_name: "Default",
        feature_key: "model.chat",
        default_revision_id: rid,
      },
      ah,
    );
    expect(label.response.status).toBe(201);
    expect(
      (
        await request(
          `model-catalog/revisions/${rid}/retire`,
          "POST",
          undefined,
          { ...ah, "if-match": '"2"' },
        )
      ).json.error?.code,
    ).toBe("RESOURCE_IN_USE");
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    try {
      await expect(
        db.query(
          "UPDATE system_fixture.model_revision SET provider_model_name='tampered' WHERE id=$1",
          [rid],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.query("DELETE FROM system_fixture.model_revision WHERE id=$1", [
          rid,
        ]),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await db.end();
    }
  });
  it("rejects publishing a legacy-valid draft without finite execution bounds atomically", async () => {
    const suffix = randomUUID();
    const product = await request(
      "products",
      "POST",
      { product_key: `bound-${suffix}`, name: "Execution bound" },
      adminHeaders,
    );
    const feature = `bound.${suffix}`;
    expect(
      (
        await request(
          "features",
          "POST",
          {
            global_feature_key: feature,
            product_id: product.json.data?.id,
            display_name: "Execution bound",
            result_contract: {
              schema_version: 1,
              outcome_kind: "message",
              media_types: [],
              required_fields: [],
            },
          },
          adminHeaders,
        )
      ).response.status,
    ).toBe(201);
    const model = await request(
      "model-catalog/definitions",
      "POST",
      { model_key: `bound-${suffix}`, display_name: "Execution bound" },
      adminHeaders,
    );
    const provider = await request(
      "model-catalog/providers",
      "POST",
      {
        provider: "litellm",
        provider_key: `bound-${suffix}`,
        display_name: "Execution bound",
        secret_handle_ref: `vault:bound-${suffix}`,
        protocol: "openai_chat_completions",
        connection_type: "litellm",
        base_url: "https://gateway.example/v1",
        priority: 1,
      },
      adminHeaders,
    );
    const draft = await request(
      "model-catalog/revisions",
      "POST",
      {
        model_id: model.json.data?.id,
        provider_id: provider.json.data?.id,
        revision: 1,
        provider_model_name: "provider-bound",
        display_name: "Execution bound",
        input_modalities: ["text"],
        output_modalities: ["text"],

        request_model: "gateway-bound",
        context_window: null,
        max_output_tokens: null,
        priority: 1,
      },
      adminHeaders,
    );
    expect(draft.response.status).toBe(201);
    const revisionId = String(draft.json.data?.id);
    const publishKey = randomUUID();
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    try {
      const snapshot = async () => {
        const revision = await db.query<{ row: string }>(
          "SELECT row_to_json(r)::text AS row FROM system_fixture.model_revision r WHERE id=$1",
          [revisionId],
        );
        const generation = await db.query<{ row: string }>(
          "SELECT row_to_json(g)::text AS row FROM system_fixture.model_cache_generation g WHERE scope='resolve'",
        );
        const receipts = await db.query<{ row: string }>(
          "SELECT row_to_json(r)::text AS row FROM system_fixture.system_command_receipt r WHERE idempotency_key=$1 ORDER BY id",
          [publishKey],
        );
        return {
          revision: revision.rows.map((row) => row.row),
          generation: generation.rows.map((row) => row.row),
          receipts: receipts.rows.map((row) => row.row),
        };
      };
      const before = await snapshot();
      for (const statement of [
        "UPDATE system_fixture.model_revision SET max_output_tokens=0 WHERE id=$1",
        "UPDATE system_fixture.model_revision SET context_window=100,max_output_tokens=101 WHERE id=$1",
        "UPDATE system_fixture.model_revision SET published_at=CURRENT_TIMESTAMP(3) WHERE id=$1",
      ]) {
        await expect(db.query(statement, [revisionId])).rejects.toMatchObject({
          code: "23514",
        });
        expect(await snapshot()).toEqual(before);
      }
      const published = await request(
        `model-catalog/revisions/${revisionId}/publish`,
        "POST",
        undefined,
        {
          ...adminHeaders,
          "if-match": '"1"',
          "idempotency-key": publishKey,
        },
      );
      const after = await snapshot();
      expect(published.response.status).toBe(409);
      expect(published.json.error).toMatchObject({
        code: "INVALID_STATE",
        retryable: false,
      });
      expect(after).toEqual(before);
    } finally {
      await db.end();
    }
  });
  it("enforces nullable draft and complete int32 execution-bound edges without side effects", async () => {
    const { modelId, pid } = await seedRoute();
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    const snapshot = async () => {
      const revisions = await db.query<{ row: string }>(
        "SELECT row_to_json(r)::text AS row FROM system_fixture.model_revision r WHERE model_id=$1 ORDER BY revision,id",
        [modelId],
      );
      const generation = await db.query<{ row: string }>(
        "SELECT row_to_json(g)::text AS row FROM system_fixture.model_cache_generation g WHERE scope='resolve'",
      );
      const receipts = await db.query<{ row: string }>(
        "SELECT row_to_json(r)::text AS row FROM system_fixture.system_command_receipt r ORDER BY scope_kind,scope_id,idempotency_key,id",
      );
      return {
        revisions: revisions.rows.map((row) => row.row),
        generation: generation.rows.map((row) => row.row),
        receipts: receipts.rows.map((row) => row.row),
      };
    };
    const input = (
      revision: number,
      contextWindow: number | null,
      maxOutputTokens: number | null,
    ) => ({
      model_id: modelId,
      provider_id: pid,
      revision,
      provider_model_name: `edge-${revision}`,
      display_name: `Edge ${revision}`,
      input_modalities: ["text"],
      output_modalities: ["text"],

      request_model: `edge-${revision}`,
      context_window: contextWindow,
      max_output_tokens: maxOutputTokens,
      priority: revision,
    });
    try {
      for (const [revision, contextWindow, maxOutputTokens] of [
        [10, 0, null],
        [11, -1, null],
        [12, 2147483648, null],
        [13, 2147483647, 0],
        [14, 2147483647, -1],
        [15, 2147483647, 2147483648],
        [16, 100, 101],
      ] as const) {
        const before = await snapshot();
        const rejected = await request(
          "model-catalog/revisions",
          "POST",
          input(revision, contextWindow, maxOutputTokens),
          adminHeaders,
        );
        expect(rejected.response.status).toBe(400);
        expect(rejected.json.error?.code).toBe("INVALID_ARGUMENT");
        expect(await snapshot()).toEqual(before);
      }
      for (const [revision, contextWindow, maxOutputTokens] of [
        [17, 2147483647, null],
        [18, null, 1],
      ] as const) {
        const draft = await request(
          "model-catalog/revisions",
          "POST",
          input(revision, contextWindow, maxOutputTokens),
          adminHeaders,
        );
        expect(draft.response.status).toBe(201);
        const revisionId = String(draft.json.data?.id);
        const beforePublish = await snapshot();
        const rejected = await request(
          `model-catalog/revisions/${revisionId}/publish`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"1"' },
        );
        expect(rejected.response.status).toBe(409);
        expect(rejected.json.error?.code).toBe("INVALID_STATE");
        expect(await snapshot()).toEqual(beforePublish);
      }
      const upper = await request(
        "model-catalog/revisions",
        "POST",
        input(19, 2147483647, 2147483647),
        adminHeaders,
      );
      expect(upper.response.status).toBe(201);
      const published = await request(
        `model-catalog/revisions/${String(upper.json.data?.id)}/publish`,
        "POST",
        undefined,
        { ...adminHeaders, "if-match": '"1"' },
      );
      expect(published.response.status).toBe(200);
      expect(published.json.data).toMatchObject({
        context_window: 2147483647,
        max_output_tokens: 2147483647,
      });
    } finally {
      await db.end();
    }
  });
  it("resolves explicit and owner-default tenant routes without leaking credentials", async () => {
    const ah = {
      "x-kokoro-service": "system-admin",
      authorization: "Bearer system-test-admin-credential",
    };
    const product = await request(
      "products",
      "POST",
      { product_key: "routing", name: "Routing" },
      ah,
    );
    await request(
      "features",
      "POST",
      {
        global_feature_key: "routing.chat",
        product_id: product.json.data?.id,
        display_name: "Chat",
        result_contract: {
          schema_version: 1,
          outcome_kind: "message",
          media_types: [],
          required_fields: [],
        },
      },
      ah,
    );
    const model = await request(
      "model-catalog/definitions",
      "POST",
      { model_key: "routing-model", display_name: "Routing" },
      ah,
    );
    const provider = await request(
        "model-catalog/providers",
        "POST",
        {
          provider: "litellm",
          provider_key: "routing-provider",
          display_name: "Provider",
          secret_handle_ref: "vault:routing",
          protocol: "openai_chat_completions",
          connection_type: "litellm",
          base_url: "https://gateway.example/v1",
          priority: 1,
        },
        ah,
      ),
      pid = String(provider.json.data?.id);
    const revision = await request(
        "model-catalog/revisions",
        "POST",
        {
          model_id: model.json.data?.id,
          provider_id: pid,
          revision: 1,
          provider_model_name: "provider-route",
          display_name: "Route",
          input_modalities: ["text"],
          output_modalities: ["text"],

          request_model: "gateway-route",
          context_window: 16384,
          max_output_tokens: 4096,
          priority: 1,
        },
        ah,
      ),
      rid = String(revision.json.data?.id);
    await request(`model-catalog/revisions/${rid}/publish`, "POST", undefined, {
      ...ah,
      "if-match": '"1"',
    });
    const label = await request(
        "model-catalog/labels",
        "POST",
        {
          label_key: "routing-default",
          display_name: "Default",
          feature_key: "routing.chat",
          default_revision_id: rid,
        },
        ah,
      ),
      lid = String(label.json.data?.id);
    const agent = {
      "x-kokoro-service": "kokoro-agent",
      authorization: "Bearer system-test-agent-credential",
      "x-kokoro-iam-permissions": "",
    };
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: "routing.chat" },
          agent,
        )
      ).json.error?.code,
    ).toBe("ROUTE_NOT_FOUND");
    const routing = await request(
      `model-catalog/routing-policies/${lid}`,
      "PUT",
      { model_revision_id: null, visible: true, is_default: true, priority: 0 },
      { "if-none-match": "*" },
    );
    expect(routing.response.status).toBe(200);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: "routing.chat" },
          agent,
        )
      ).json.error?.code,
    ).toBe("MODEL_UNAVAILABLE");
    await request(
      `model-catalog/providers/${pid}/health`,
      "PUT",
      { status: "healthy", observed_at: new Date().toISOString() },
      { ...ah, "if-none-match": "*" },
    );
    const resolved = await request(
      "model-catalog/resolve",
      "POST",
      { feature_key: "routing.chat" },
      agent,
    );
    expect(resolved.response.status).toBe(200);
    expect(resolved.json.data?.revision_id).toBe(rid);
    expect(resolved.json.data?.request_model).toBe("gateway-route");
    expect(resolved.json.data?.context_window).toBe(16384);
    expect(resolved.json.data?.max_output_tokens).toBe(4096);
    expect(resolved.json.data).not.toHaveProperty("secret_handle_ref");
    const cached = await request(
      "model-catalog/resolve",
      "POST",
      { feature_key: "routing.chat" },
      agent,
    );
    expect(cached.response.status).toBe(200);
    expect(cached.json.data).toEqual(resolved.json.data);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: "routing.chat", label_key: "routing-default" },
          agent,
        )
      ).json.data?.revision_id,
    ).toBe(rid);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: "routing.chat" },
          agent,
          "other-tenant",
        )
      ).json.error?.code,
    ).toBe("ROUTE_NOT_FOUND");
    const catalog = await request(
      "model-catalog/catalog?feature_key=routing.chat",
      "GET",
      undefined,
      { "x-kokoro-iam-permissions": "" },
    );
    expect(catalog.response.status).toBe(200);
    expect(catalog.json.data?.items).toEqual([
      {
        key: "routing-default",
        display_name: "Default",
        is_default: true,
        feature_key: "routing.chat",
        model_id: model.json.data?.id,
        provider_id: pid,
        provider: "litellm",
        revision_id: rid,
        request_model: "gateway-route",
      },
    ]);
    await request(
      `model-catalog/routing-policies/${lid}`,
      "PUT",
      {
        model_revision_id: null,
        visible: false,
        is_default: true,
        priority: 0,
      },
      { "if-match": '"1"' },
    );
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: "routing.chat" },
          agent,
        )
      ).json.error?.code,
    ).toBe("POLICY_DENIED");
  });
  it("rejects a checksummed relationally-invalid route from the real isolated cache", async () => {
    const { feature, pid, rid } = await seedRoute();
    expect(
      (
        await request(
          `model-catalog/providers/${pid}/health`,
          "PUT",
          { status: "healthy", observed_at: new Date().toISOString() },
          { ...adminHeaders, "if-none-match": "*" },
        )
      ).response.status,
    ).toBe(200);
    const first = await request(
      "model-catalog/resolve",
      "POST",
      { feature_key: feature },
      agentHeaders,
    );
    expect(first.response.status).toBe(200);
    const generation = String(first.json.data?.generation);
    const tenantGeneration = String(first.json.data?.tenant_generation);
    const key = `model-resolve:v5:${commandDigest({
      tenant: "tenant-a",
      allow_loopback_http: false,
      feature,
      label: null,
      generation,
      tenant_generation: tenantGeneration,
    })}`;
    const cache = app.get(CacheService);
    const raw = await cache.get(key);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw ?? "null") as {
      kind: "route";
      key: string;
      checksum: string;
      expires_at: number;
      data: Record<string, unknown>;
    };
    const poisonedWithoutChecksum = {
      kind: stored.kind,
      key: stored.key,
      expires_at: stored.expires_at,
      data: {
        ...stored.data,
        context_window: 100,
        max_output_tokens: 101,
      },
    };
    await cache.set(
      key,
      JSON.stringify({
        ...poisonedWithoutChecksum,
        checksum: commandDigest(poisonedWithoutChecksum),
      }),
      30,
    );
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    try {
      const snapshot = async () => {
        const revision = await db.query<{ row: string }>(
          "SELECT row_to_json(r)::text AS row FROM system_fixture.model_revision r WHERE id=$1",
          [rid],
        );
        const fences = await db.query<{ row: string }>(
          "SELECT row_to_json(g)::text AS row FROM system_fixture.model_cache_generation g WHERE scope='resolve'",
        );
        return {
          revision: revision.rows.map((row) => row.row),
          fences: fences.rows.map((row) => row.row),
        };
      };
      const before = await snapshot();
      let rejected: Awaited<ReturnType<typeof request>>;
      try {
        rejected = await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        );
      } finally {
        await cache.remove(key);
      }
      let recovered: Awaited<ReturnType<typeof request>>;
      try {
        recovered = await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        );
      } finally {
        await cache.remove(key);
      }
      expect(rejected.response.status).toBe(503);
      expect(rejected.json.error).toMatchObject({
        code: "SYSTEM_UNAVAILABLE",
        retryable: true,
      });
      expect(recovered.response.status).toBe(200);
      expect(recovered.json.data?.revision_id).toBe(rid);
      expect(await snapshot()).toEqual(before);
    } finally {
      await cache.remove(key);
      await db.end();
    }
  });
  it("enforces observation freshness, health CAS and cache expiry at health deadline", async () => {
    const { feature, pid } = await seedRoute();
    const hp = `model-catalog/providers/${pid}/health`;
    expect(
      (
        await request(
          hp,
          "PUT",
          {
            status: "healthy",
            observed_at: new Date(Date.now() - 3000).toISOString(),
          },
          { ...adminHeaders, "if-none-match": "*" },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).json.error?.code,
    ).toBe("MODEL_UNAVAILABLE");
    const observed = new Date().toISOString();
    expect(
      (
        await request(
          hp,
          "PUT",
          { status: "healthy", observed_at: observed },
          { ...adminHeaders, "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          hp,
          "PUT",
          {
            status: "down",
            observed_at: new Date(Date.now() - 5000).toISOString(),
          },
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          hp,
          "PUT",
          {
            status: "healthy",
            observed_at: new Date(Date.now() + 60000).toISOString(),
          },
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).json.error?.code,
    ).toBe("MODEL_UNAVAILABLE");
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
  });
  it("isolates default uniqueness, CAS replay and tenant/global generations", async () => {
    const { feature, lid, rid, pid, modelId, featureId } = await seedRoute();
    const other = await request(
        "model-catalog/labels",
        "POST",
        {
          label_key: randomUUID(),
          display_name: "Other",
          feature_key: feature,
          default_revision_id: rid,
        },
        adminHeaders,
      ),
      otherId = String(other.json.data?.id);
    expect(
      (
        await request(
          `model-catalog/routing-policies/${otherId}`,
          "PUT",
          {
            model_revision_id: null,
            visible: true,
            is_default: true,
            priority: 0,
          },
          { "if-none-match": "*" },
        )
      ).response.status,
    ).toBe(409);
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    try {
      const snapshot = () =>
        db.query<{ global: string; tenant: string }>(
          "SELECT (SELECT generation FROM system_fixture.model_cache_generation WHERE scope='resolve') AS global,(SELECT generation FROM system_fixture.system_runtime_manifest_generation WHERE tenant_id='tenant-a') AS tenant",
        );
      const before = (await snapshot()).rows[0]!;
      const key = randomUUID(),
        body = {
          model_revision_id: rid,
          visible: true,
          is_default: true,
          priority: 2,
        },
        headers = { "idempotency-key": key, "if-match": '"1"' };
      const results = await Promise.all([
        request(`model-catalog/routing-policies/${lid}`, "PUT", body, headers),
        request(`model-catalog/routing-policies/${lid}`, "PUT", body, headers),
      ]);
      expect(results.map((r) => r.response.status)).toEqual([200, 200]);
      expect(results[0]?.json).toEqual(results[1]?.json);
      const after = (await snapshot()).rows[0]!;
      expect(after.global).toBe(before.global);
      expect(BigInt(after.tenant)).toBe(BigInt(before.tenant) + 1n);
      expect(
        (
          await request(
            `model-catalog/routing-policies/${lid}`,
            "PUT",
            { ...body, priority: 3 },
            headers,
          )
        ).response.status,
      ).toBe(409);
      expect(
        (
          await request(`model-catalog/providers/${pid}`, "DELETE", undefined, {
            ...adminHeaders,
            "if-match": '"1"',
          })
        ).json.error?.code,
      ).toBe("RESOURCE_IN_USE");
      expect(
        (
          await request(
            `model-catalog/definitions/${modelId}`,
            "DELETE",
            undefined,
            { ...adminHeaders, "if-match": '"1"' },
          )
        ).json.error?.code,
      ).toBe("RESOURCE_IN_USE");
      expect(
        (
          await request(`features/${featureId}/retire`, "POST", undefined, {
            ...adminHeaders,
            "if-match": '"1"',
          })
        ).json.error?.code,
      ).toBe("RESOURCE_IN_USE");
    } finally {
      await db.end();
    }
  });
  it("dispatches every Model operation through native Nest and restricts Agent operations", async () => {
    const operations = systemOperations.filter(
      (op) => op.module === "model-catalog",
    );
    expect(operations).toHaveLength(30);
    for (const op of operations) {
      const path = op.path
        .replace("/v1/system/", "")
        .replace(/\{[^}]+\}/gu, () => randomUUID());
      expect(
        (
          await request(path, op.method.toUpperCase(), undefined, {
            authorization: "Bearer wrong",
          })
        ).response.status,
        op.operationId,
      ).toBe(403);
    }
    expect(
      (
        await request(
          "runtime-manifest?product_id=any",
          "GET",
          undefined,
          agentHeaders,
        )
      ).response.status,
    ).toBe(403);
  });
  it("fences cache publication against global health and tenant visibility mutations", async () => {
    const cache = app.get(CacheService),
      set = cache.set.bind(cache);
    for (const globalChange of [true, false]) {
      const { feature, pid, lid } = await seedRoute();
      await request(
        `model-catalog/providers/${pid}/health`,
        "PUT",
        { status: "healthy", observed_at: new Date().toISOString() },
        { ...adminHeaders, "if-none-match": "*" },
      );
      const spy = vi
        .spyOn(cache, "set")
        .mockImplementationOnce(async (key, value, seconds) => {
          await set(key, value, seconds);
          const result = globalChange
            ? await request(
                `model-catalog/providers/${pid}/health`,
                "PUT",
                { status: "down", observed_at: new Date().toISOString() },
                { ...adminHeaders, "if-match": '"1"' },
              )
            : await request(
                `model-catalog/routing-policies/${lid}`,
                "PUT",
                {
                  model_revision_id: null,
                  visible: false,
                  is_default: true,
                  priority: 0,
                },
                { "if-match": '"1"' },
              );
          expect(result.response.status).toBe(200);
        });
      const resolved = await request(
        "model-catalog/resolve",
        "POST",
        { feature_key: feature },
        agentHeaders,
      );
      expect(resolved.json.error?.code).toBe(
        globalChange ? "MODEL_UNAVAILABLE" : "POLICY_DENIED",
      );
      spy.mockRestore();
    }
    const { feature, pid } = await seedRoute();
    await request(
      `model-catalog/providers/${pid}/health`,
      "PUT",
      { status: "healthy", observed_at: new Date().toISOString() },
      { ...adminHeaders, "if-none-match": "*" },
    );
    const poisoned = vi.spyOn(cache, "get").mockResolvedValueOnce("{}");
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).response.status,
    ).toBe(503);
    poisoned.mockRestore();
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).response.status,
    ).toBe(200);
    const originalGet = cache.get.bind(cache),
      read = vi.spyOn(cache, "get").mockImplementationOnce(async (key) => {
        const value = await originalGet(key);
        await request(
          `model-catalog/providers/${pid}/health`,
          "PUT",
          { status: "down", observed_at: new Date().toISOString() },
          { ...adminHeaders, "if-match": '"1"' },
        );
        return value;
      });
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).json.error?.code,
    ).toBe("MODEL_UNAVAILABLE");
    read.mockRestore();
  });
  it("does not return a cached healthy route after final fence read crosses health expiry", async () => {
    const { feature, pid } = await seedRoute();
    await request(
      `model-catalog/providers/${pid}/health`,
      "PUT",
      { status: "healthy", observed_at: new Date().toISOString() },
      { ...adminHeaders, "if-none-match": "*" },
    );
    expect(
      (
        await request(
          "model-catalog/resolve",
          "POST",
          { feature_key: feature },
          agentHeaders,
        )
      ).response.status,
    ).toBe(200);
    const generations = app.get(ModelGenerationRepository),
      read = generations.read.bind(generations);
    const spy = vi
      .spyOn(generations, "read")
      .mockImplementationOnce(read)
      .mockImplementationOnce(async (tx, tenant) => {
        await new Promise((resolve) => setTimeout(resolve, 2100));
        return read(tx, tenant);
      });
    try {
      expect(
        (
          await request(
            "model-catalog/resolve",
            "POST",
            { feature_key: feature },
            agentHeaders,
          )
        ).json.error?.code,
      ).toBe("MODEL_UNAVAILABLE");
    } finally {
      spy.mockRestore();
    }
  });
  it("serializes revision retirement with label-default creation in both parent lock orderings", async () => {
    for (const parentFirst of [true, false]) {
      const { rid, lid, feature } = await seedRoute();
      await request(
        `model-catalog/routing-policies/${lid}`,
        "DELETE",
        undefined,
        { "if-match": '"1"' },
      );
      await request(`model-catalog/labels/${lid}`, "DELETE", undefined, {
        ...adminHeaders,
        "if-match": '"1"',
      });
      const lock = new Client(parseSystemDatabaseUrl(databaseUrl.href));
      await lock.connect();
      await lock.query("BEGIN");
      try {
        await lock.query(
          "SELECT id FROM system_fixture.model_revision WHERE id=$1 FOR UPDATE",
          [rid],
        );
        const waiting = parentFirst
          ? request(
              "model-catalog/labels",
              "POST",
              {
                label_key: randomUUID(),
                display_name: "Race",
                feature_key: feature,
                default_revision_id: rid,
              },
              adminHeaders,
            )
          : request(
              `model-catalog/revisions/${rid}/retire`,
              "POST",
              undefined,
              { ...adminHeaders, "if-match": '"2"' },
            );
        let blocked = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          const result = await admin.query<{ blocked: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=$1 AND cardinality(pg_blocking_pids(pid))>0) AS blocked",
            [databaseName],
          );
          if (result.rows[0]?.blocked) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
        if (parentFirst)
          await lock.query(
            "UPDATE system_fixture.model_revision SET retired_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE id=$1",
            [rid],
          );
        else
          await lock.query(
            "INSERT INTO system_fixture.model_label(id,label_key,display_name,feature_key,default_revision_id) VALUES($1,$2,'Race',$3,$4)",
            [randomUUID(), randomUUID(), feature, rid],
          );
        await lock.query("COMMIT");
        const result = await waiting;
        expect(result.response.status).toBe(409);
        expect(result.json.error?.code).toBe(
          parentFirst ? "INVALID_STATE" : "RESOURCE_IN_USE",
        );
      } finally {
        await lock.query("ROLLBACK");
        await lock.end();
      }
    }
  });
  it("rejects PostgreSQL integer overflow before attempting a revision write", async () => {
    const { modelId, pid } = await seedRoute();
    const result = await request(
      "model-catalog/revisions",
      "POST",
      {
        model_id: modelId,
        provider_id: pid,
        revision: 2147483648,
        provider_model_name: "overflow",
        display_name: "Overflow",
        input_modalities: ["text"],
        output_modalities: ["text"],

        request_model: "overflow",
        context_window: null,
        max_output_tokens: null,
        priority: 1,
      },
      adminHeaders,
    );
    expect(result.response.status).toBe(400);
    expect(result.json.error?.code).toBe("INVALID_ARGUMENT");
  });
  it("supports draft PATCH and provider/label lifecycle without reusing tombstone keys", async () => {
    const { modelId, pid, feature } = await seedRoute();
    const input = {
      model_id: modelId,
      provider_id: pid,
      revision: 2,
      provider_model_name: "draft",
      display_name: "Draft",
      input_modalities: ["text"],
      output_modalities: ["text"],

      request_model: "draft",
      context_window: null,
      max_output_tokens: null,
      priority: 5,
    };
    const draft = await request(
        "model-catalog/revisions",
        "POST",
        input,
        adminHeaders,
      ),
      rid = String(draft.json.data?.id);
    expect(draft.response.status).toBe(201);
    const changed = await request(
      `model-catalog/revisions/${rid}`,
      "PATCH",
      {
        provider_model_name: "changed",
        context_window: 12000,
        max_output_tokens: 3000,
      },
      { ...adminHeaders, "if-match": '"1"' },
    );
    expect(changed.response.status).toBe(200);
    expect(changed.json.data?.digest).not.toBe(draft.json.data?.digest);
    const invalidPartial = await request(
      `model-catalog/revisions/${rid}`,
      "PATCH",
      { max_output_tokens: 13000 },
      { ...adminHeaders, "if-match": '"2"' },
    );
    expect(invalidPartial.response.status).toBe(400);
    expect(invalidPartial.json.error?.code).toBe("INVALID_ARGUMENT");
    const unchanged = await request(
      `model-catalog/revisions/${rid}`,
      "GET",
      undefined,
      adminHeaders,
    );
    expect(unchanged.json.data?.version).toBe("2");
    expect(unchanged.json.data?.max_output_tokens).toBe(3000);
    expect(
      (
        await request(
          `model-catalog/revisions/${rid}/publish`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          `model-catalog/revisions/${rid}/publish`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(200);
    const labelInput = {
      label_key: randomUUID(),
      display_name: "Lifecycle",
      feature_key: feature,
      default_revision_id: rid,
    };
    const label = await request(
        "model-catalog/labels",
        "POST",
        labelInput,
        adminHeaders,
      ),
      lid = String(label.json.data?.id);
    expect(
      (
        await request(
          `model-catalog/labels/${lid}`,
          "PATCH",
          { default_revision_id: null, display_name: "Changed" },
          { ...adminHeaders, "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/revisions/${rid}/retire`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"3"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(`model-catalog/labels/${lid}`, "DELETE", undefined, {
          ...adminHeaders,
          "if-match": '"2"',
        })
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "model-catalog/labels",
          "POST",
          { ...labelInput, default_revision_id: null },
          adminHeaders,
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          `model-catalog/labels/${lid}/restore`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"3"' },
        )
      ).response.status,
    ).toBe(200);
    const providerInput = {
      provider: "litellm",
      provider_key: randomUUID(),
      display_name: "Lifecycle",
      secret_handle_ref: "vault:lifecycle",
      protocol: "openai_chat_completions",
      connection_type: "litellm",
      base_url: "https://gateway.example/v1",
      priority: 1,
    };
    const provider = await request(
        "model-catalog/providers",
        "POST",
        providerInput,
        adminHeaders,
      ),
      providerId = String(provider.json.data?.id);
    expect(
      (
        await request(
          `model-catalog/providers/${providerId}`,
          "PATCH",
          { priority: 7 },
          { ...adminHeaders, "if-match": '"1"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/providers/${providerId}`,
          "DELETE",
          undefined,
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          "model-catalog/providers",
          "POST",
          providerInput,
          adminHeaders,
        )
      ).response.status,
    ).toBe(409);
    expect(
      (
        await request(
          `model-catalog/providers/${providerId}/restore`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"3"' },
        )
      ).response.status,
    ).toBe(200);
    for (const path of [
      "definitions",
      "providers",
      "labels",
      "revisions",
      "routing-policies",
    ])
      expect(
        (await request(`model-catalog/${path}?limit=1`)).response.status,
      ).toBe(200);
  });
});

describe("real immutable model connection lifecycle", () => {
  it("keeps same-path direct and LiteLLM addresses/accounts separate through snapshot, metadata edits and cache", async () => {
    for (const connection of [
      {
        connection_type: "direct",
        base_url: "https://vendor.example/custom/v1",
        secret_handle_ref: "vault:vendor-account",
      },
      {
        connection_type: "litellm",
        base_url: "https://gateway.example/custom/v1",
        secret_handle_ref: "vault:gateway-account",
      },
    ]) {
      const route = await seedRoute(connection);
      const initial = (
        await request(
          `model-catalog/revisions/${route.rid}`,
          "GET",
          undefined,
          adminHeaders,
        )
      ).json.data!;
      expect(initial.connection).toEqual({
        protocol: "openai_chat_completions",
        ...connection,
      });
      expect(initial.digest).toBe(
        commandDigest(revisionContent(revisionSchema.parse(initial))),
      );
      expect(
        (
          await request(
            `model-catalog/providers/${route.pid}`,
            "PATCH",
            { display_name: "Metadata only" },
            { ...adminHeaders, "if-match": '"1"' },
          )
        ).response.status,
      ).toBe(200);
      for (const patch of [
        { base_url: "https://other.example/custom/v1" },
        { secret_handle_ref: "vault:other" },
      ]) {
        expect(
          (
            await request(
              `model-catalog/providers/${route.pid}`,
              "PATCH",
              patch,
              { ...adminHeaders, "if-match": '"2"' },
            )
          ).response.status,
        ).toBe(400);
      }
      expect(
        (
          await request(
            `model-catalog/providers/${route.pid}/health`,
            "PUT",
            { status: "healthy", observed_at: new Date().toISOString() },
            { ...adminHeaders, "if-none-match": "*" },
          )
        ).response.status,
      ).toBe(200);
      const reads = [];
      for (let i = 0; i < 2; i++)
        reads.push(
          await request(
            "model-catalog/resolve",
            "POST",
            { feature_key: route.feature },
            agentHeaders,
          ),
        );
      expect(reads.map((r) => r.response.status)).toEqual([200, 200]);
      expect(reads[1]!.json.data).toEqual(reads[0]!.json.data);
      expect(reads[0]!.json.data).toMatchObject({
        connection: initial.connection,
        digest: initial.digest,
        request_model: "gateway",
        provider_model_name: "provider",
      });
      expect(reads[0]!.json.data).not.toHaveProperty("gateway_model_name");
      const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
      await db.connect();
      try {
        for (const sql of [
          "UPDATE system_fixture.model_provider SET base_url='https://other.example/v1' WHERE id=$1",
          "UPDATE system_fixture.model_provider SET secret_handle_ref='vault:other' WHERE id=$1",
          "DELETE FROM system_fixture.model_provider WHERE id=$1",
        ]) {
          await expect(db.query(sql, [route.pid])).rejects.toMatchObject({
            code: "23514",
          });
        }
        await expect(
          db.query(
            "UPDATE system_fixture.model_revision SET connection_secret_handle_ref='vault:other' WHERE id=$1",
            [route.rid],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await db.end();
      }
      expect(
        (
          await request(
            `model-catalog/revisions/${route.rid}`,
            "GET",
            undefined,
            adminHeaders,
          )
        ).json.data,
      ).toEqual(initial);
    }
  });
  it("rejects caller/corrupt snapshots and only owner-builds a draft's new-provider snapshot", async () => {
    const route = await seedRoute();
    const old = revisionSchema.parse(
      (
        await request(
          `model-catalog/revisions/${route.rid}`,
          "GET",
          undefined,
          adminHeaders,
        )
      ).json.data,
    );
    const { connection, ...input } = revisionContent(old);
    const body = { ...input, revision: 2 };
    expect(
      (
        await request(
          "model-catalog/revisions",
          "POST",
          { ...body, connection },
          adminHeaders,
        )
      ).response.status,
    ).toBe(400);
    const draft = await request(
      "model-catalog/revisions",
      "POST",
      body,
      adminHeaders,
    );
    expect(draft.response.status).toBe(201);
    const id = String(draft.json.data?.id);
    const db = new Client(parseSystemDatabaseUrl(databaseUrl.href));
    await db.connect();
    try {
      await db.query(
        "UPDATE system_fixture.model_revision SET connection_base_url='https://wrong.example/v1' WHERE id=$1",
        [id],
      );
      const before = (
        await db.query(
          "SELECT generation::text FROM system_fixture.model_cache_generation",
        )
      ).rows;
      const rejected = await request(
        `model-catalog/revisions/${id}/publish`,
        "POST",
        undefined,
        { ...adminHeaders, "if-match": '"1"' },
      );
      expect(rejected.response.status).toBe(409);
      expect(rejected.json.error?.code).toBe("INVALID_STATE");
      expect(
        (
          await db.query(
            "SELECT generation::text FROM system_fixture.model_cache_generation",
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await request(
            `model-catalog/revisions/${id}`,
            "GET",
            undefined,
            adminHeaders,
          )
        ).json.data?.published_at,
      ).toBeNull();
    } finally {
      await db.end();
    }
    // Omitting topology on the wire defaults only this new connection to direct.
    const next = await request(
      "model-catalog/providers",
      "POST",
      {
        provider: "vendor",
        provider_key: randomUUID(),
        display_name: "New endpoint",
        protocol: "openai_chat_completions",
        base_url: "https://new.example/v1",
        secret_handle_ref: "vault:new-account",
        priority: 1,
      },
      adminHeaders,
    );
    expect(next.response.status).toBe(201);
    expect(next.json.data?.connection_type).toBe("direct");
    const updated = await request(
      `model-catalog/revisions/${id}`,
      "PATCH",
      { provider_id: next.json.data?.id, request_model: "new-request-model" },
      { ...adminHeaders, "if-match": '"1"' },
    );
    expect(updated.response.status).toBe(200);
    expect(updated.json.data?.connection).toEqual({
      protocol: "openai_chat_completions",
      connection_type: "direct",
      base_url: "https://new.example/v1",
      secret_handle_ref: "vault:new-account",
    });
    expect(updated.json.data?.digest).toBe(
      commandDigest(revisionContent(revisionSchema.parse(updated.json.data))),
    );
    expect(
      (
        await request(
          `model-catalog/revisions/${id}/publish`,
          "POST",
          undefined,
          { ...adminHeaders, "if-match": '"2"' },
        )
      ).response.status,
    ).toBe(200);
    expect(
      (
        await request(
          `model-catalog/revisions/${route.rid}`,
          "GET",
          undefined,
          adminHeaders,
        )
      ).json.data?.connection,
    ).toEqual(connection);
  });
  it("requires explicit deployment permission for loopback creation and resolve, including another deployment's cache", async () => {
    const connection = {
      connection_type: "direct",
      base_url: "http://127.0.0.1:1234/custom/v1",
      secret_handle_ref: "vault:loopback",
    };
    expect(
      (
        await request(
          "model-catalog/providers",
          "POST",
          {
            provider: "test",
            provider_key: randomUUID(),
            display_name: "Loopback",
            protocol: "openai_chat_completions",
            priority: 1,
            ...connection,
          },
          adminHeaders,
        )
      ).response.status,
    ).toBe(400);
    const allowed = await NestFactory.create<NestExpressApplication>(
      AppModule.forRoot({
        DATABASE_URL: databaseUrl.href,
        REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/2",
        KOKORO_SYSTEM_REDIS_NAMESPACE: databaseName,
        KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL: "true",
        KOKORO_SYSTEM_MODEL_HEALTH_MAX_AGE_MS: "2000",
        KOKORO_SYSTEM_BFF_SERVICE_TOKEN: token,
        KOKORO_SYSTEM_AGENT_SERVICE_TOKEN: "system-test-agent-credential",
        KOKORO_SYSTEM_ADMIN_SERVICE_TOKEN: "system-test-admin-credential",
      }),
      { logger: false },
    );
    configureHttp(allowed);
    await allowed.listen(0, "127.0.0.1");
    try {
      const target = await allowed.getUrl();
      const route = await seedRoute(connection, target);
      expect(
        (
          await request(
            `model-catalog/providers/${route.pid}/health`,
            "PUT",
            { status: "healthy", observed_at: new Date().toISOString() },
            { ...adminHeaders, "if-none-match": "*" },
            "tenant-a",
            target,
          )
        ).response.status,
      ).toBe(200);
      expect(
        (
          await request(
            "model-catalog/resolve",
            "POST",
            { feature_key: route.feature },
            agentHeaders,
            "tenant-a",
            target,
          )
        ).json.data?.connection,
      ).toEqual({ protocol: "openai_chat_completions", ...connection });
      const denied = await request(
        "model-catalog/resolve",
        "POST",
        { feature_key: route.feature },
        agentHeaders,
      );
      expect(denied.response.status).toBe(503);
      expect(denied.json.error?.code).toBe("MODEL_UNAVAILABLE");
    } finally {
      await allowed.close();
    }
  });
});

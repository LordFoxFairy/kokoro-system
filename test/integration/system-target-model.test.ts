import { ModelGenerationRepository } from "../../src/modules/model-catalog/model-generation.repository.js";
import { CacheService } from "../../src/cache/cache.service.js";
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
) {
  const response = await fetch(`${base}/v1/system/${path}`, {
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
  const schema = new Client({ connectionString: databaseUrl.href });
  await schema.connect();
  try {
    await schema.query("SET search_path TO public,pg_catalog");
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
async function seedRoute() {
  const suffix = randomUUID(),
    feature = `feature.${suffix}`;
  const product = await request(
    "products",
    "POST",
    { product_key: suffix, name: "Route" },
    adminHeaders,
  );
  const f = await request(
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
  const model = await request(
    "model-catalog/definitions",
    "POST",
    { model_key: suffix, display_name: "Route" },
    adminHeaders,
  );
  const provider = await request(
      "model-catalog/providers",
      "POST",
      {
        provider: "litellm",
        provider_key: suffix,
        display_name: "Route",
        secret_handle_ref: "vault:route",
        transport: "litellm",
        priority: 1,
      },
      adminHeaders,
    ),
    pid = String(provider.json.data?.id);
  const revision = await request(
      "model-catalog/revisions",
      "POST",
      {
        model_id: model.json.data?.id,
        provider_id: pid,
        revision: 1,
        provider_model_name: "provider",
        display_name: "Route",
        feature_key: feature,
        input_modalities: ["text"],
        output_modalities: ["text"],
        transport: "litellm",
        gateway_model_name: "gateway",
        context_window: null,
        priority: 1,
      },
      adminHeaders,
    ),
    rid = String(revision.json.data?.id);
  expect(revision.response.status).toBe(201);
  expect(
    (
      await request(
        `model-catalog/revisions/${rid}/publish`,
        "POST",
        undefined,
        { ...adminHeaders, "if-match": '"1"' },
      )
    ).response.status,
  ).toBe(200);
  const label = await request(
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
      await request(
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
        transport: "litellm",
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
        transport: "litellm",
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
      feature_key: "model.chat",
      input_modalities: ["text"],
      output_modalities: ["text"],
      transport: "litellm",
      gateway_model_name: "gateway-model",
      context_window: 8000,
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
    const db = new Client({ connectionString: databaseUrl.href });
    await db.connect();
    try {
      await expect(
        db.query(
          "UPDATE public.model_revision SET provider_model_name='tampered' WHERE id=$1",
          [rid],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await expect(
        db.query("DELETE FROM public.model_revision WHERE id=$1", [rid]),
      ).rejects.toMatchObject({ code: "23514" });
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
          transport: "litellm",
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
          feature_key: "routing.chat",
          input_modalities: ["text"],
          output_modalities: ["text"],
          transport: "litellm",
          gateway_model_name: "gateway-route",
          context_window: null,
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
    expect(resolved.json.data?.gateway_model_name).toBe("gateway-route");
    expect(resolved.json.data).not.toHaveProperty("secret_handle_ref");
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
        default_revision_id: rid,
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
    const db = new Client({ connectionString: databaseUrl.href });
    await db.connect();
    try {
      const snapshot = () =>
        db.query<{ global: string; tenant: string }>(
          "SELECT (SELECT generation FROM public.model_cache_generation WHERE scope='resolve') AS global,(SELECT generation FROM public.system_runtime_manifest_generation WHERE tenant_id='tenant-a') AS tenant",
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
      const lock = new Client({ connectionString: databaseUrl.href });
      await lock.connect();
      await lock.query("BEGIN");
      try {
        await lock.query(
          "SELECT id FROM public.model_revision WHERE id=$1 FOR UPDATE",
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
            "UPDATE public.model_revision SET retired_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE id=$1",
            [rid],
          );
        else
          await lock.query(
            "INSERT INTO public.model_label(id,label_key,display_name,feature_key,default_revision_id) VALUES($1,$2,'Race',$3,$4)",
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
    const { modelId, pid, feature } = await seedRoute();
    const result = await request(
      "model-catalog/revisions",
      "POST",
      {
        model_id: modelId,
        provider_id: pid,
        revision: 2147483648,
        provider_model_name: "overflow",
        display_name: "Overflow",
        feature_key: feature,
        input_modalities: ["text"],
        output_modalities: ["text"],
        transport: "litellm",
        gateway_model_name: "overflow",
        context_window: null,
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
      feature_key: feature,
      input_modalities: ["text"],
      output_modalities: ["text"],
      transport: "litellm",
      gateway_model_name: "draft",
      context_window: null,
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
      { provider_model_name: "changed", context_window: 12000 },
      { ...adminHeaders, "if-match": '"1"' },
    );
    expect(changed.response.status).toBe(200);
    expect(changed.json.data?.digest).not.toBe(draft.json.data?.digest);
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
      transport: "litellm",
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
          { priority: 7, secret_handle_ref: "vault:rotated" },
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

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
import { createServer, request as nativeRequest } from "node:http";
import { once } from "node:events";
import type { ServerResponse } from "node:http";
const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "TEST_ADMIN_DATABASE_URL required for real credential integration",
  );
const databaseName = `system_discovery_${randomUUID().replaceAll("-", "")}`;
const url = new URL(adminUrl);
url.pathname = `/${databaseName}`;
url.searchParams.set("schema", "discovery_fixture");
const admin = new Client({ connectionString: adminUrl }),
  db = new Client(parseSystemDatabaseUrl(url.href));
const directory = mkdtempSync(join(tmpdir(), "kokoro-discovery-http-")),
  materialFile = join(directory, "material.json");
writeFileSync(
  materialFile,
  JSON.stringify({
    encryption_key: randomBytes(32).toString("base64"),
    idempotency_hmac_key: randomBytes(32).toString("base64"),
  }),
  { mode: 0o600 },
);
let app: NestExpressApplication, base: string, upstreamBase: string;
let sends = 0;
let hold: ((response: ServerResponse) => void) | undefined;
const peer = createServer((incoming, response) => {
  sends++;
  expect(incoming.method).toBe("GET");
  expect(incoming.url).toBe("/custom/v1/models");
  expect(incoming.headers.authorization).toBe(
    "Bearer fixture-key-never-sent-to-model",
  );
  if (hold) {
    hold(response);
    return;
  }
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      data: [{ id: "vendor/shared-model", owned_by: "discard" }],
    }),
  );
});
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
      ...(body === undefined ? {} : { "content-type": "application/json" }),
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
    base_url: upstreamBase,
    priority: 0,
    api_key: "fixture-key-never-sent-to-model",
  };
}
beforeAll(async () => {
  peer.listen(0, "127.0.0.1");
  await once(peer, "listening");
  const address = peer.address();
  if (!address || typeof address === "string")
    throw new Error("Missing peer address");
  upstreamBase = `http://127.0.0.1:${address.port}/custom/v1`;
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  await db.connect();
  await db.query(
    "CREATE SCHEMA discovery_fixture; SET search_path TO discovery_fixture,pg_catalog",
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
      KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL: "true",
    }),
    { logger: false },
  );
  configureHttp(app);
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
}, 30000);
afterAll(async () => {
  if (app) await app.close();
  peer.closeAllConnections();
  await new Promise<void>((resolve) => peer.close(() => resolve()));
  await db.end();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
  rmSync(directory, { recursive: true, force: true });
});
async function createProvider() {
  const provider = await request(
    "model-catalog/providers",
    "POST",
    providerInput(),
  );
  expect(provider.response.status).toBe(201);
  return {
    id: String(provider.body.data.id),
    version: String(provider.body.data.version),
  };
}
function path(id: string) {
  return `model-catalog/providers/${id}/upstream-models`;
}
async function catalogState() {
  return (
    await db.query<Record<string, unknown>>(
      "SELECT (SELECT count(*) FROM model_definition)::text AS definitions,(SELECT count(*) FROM model_revision)::text AS revisions,(SELECT count(*) FROM model_label)::text AS labels,(SELECT count(*) FROM model_routing_policy)::text AS routes,(SELECT count(*) FROM model_provider_health_state)::text AS health,(SELECT count(*) FROM system_command_receipt)::text AS receipts,(SELECT jsonb_agg(to_jsonb(g)) FROM model_cache_generation g) AS generation",
    )
  ).rows;
}
// The same public configuration journey supplies an exact eligible route;
// no health row is seeded, so resolve must produce its own real observation.
async function createRoute() {
  const provider = await createProvider();
  const feature = `probe.${randomUUID()}`;
  const create = async (path: string, body: unknown) => {
    const result = await request(path, "POST", body, {
      service: "system-admin",
    });
    expect(result.response.status).toBe(201);
    return result.body.data;
  };
  const product = await create("products", {
    product_key: randomUUID(),
    name: "Probe",
  });
  await create("features", {
    global_feature_key: feature,
    product_id: product.id,
    display_name: "Probe",
    result_contract: {
      schema_version: 1,
      outcome_kind: "message",
      media_types: [],
      required_fields: [],
    },
  });
  const model = await create("model-catalog/definitions", {
    model_key: randomUUID(),
    display_name: "Probe",
  });
  const revision = await create("model-catalog/revisions", {
    model_id: model.id,
    provider_id: provider.id,
    revision: 1,
    provider_model_name: "vendor/shared-model",
    request_model: "vendor/shared-model",
    display_name: "Probe",
    input_modalities: ["text"],
    output_modalities: ["text"],
    context_window: 4096,
    max_output_tokens: 128,
    priority: 0,
  });
  expect(
    (
      await request(
        `model-catalog/revisions/${String(revision.id)}/publish`,
        "POST",
        undefined,
        { service: "system-admin", match: '"1"' },
      )
    ).response.status,
  ).toBe(200);
  const label = await create("model-catalog/labels", {
    label_key: randomUUID(),
    feature_key: feature,
    default_revision_id: revision.id,
  });
  expect(
    (
      await request(
        `model-catalog/routing-policies/${String(label.id)}`,
        "PUT",
        {
          model_revision_id: null,
          visible: true,
          is_default: true,
          priority: 0,
        },
        { service: "web-bff", none: "*" },
      )
    ).response.status,
  ).toBe(200);
  return {
    provider: provider.id,
    revision: String(revision.id),
    label: String(label.id),
    feature,
  };
}
function resolveRoute(feature: string) {
  return request(
    "model-catalog/resolve",
    "POST",
    { feature_key: feature },
    { service: "kokoro-agent" },
  );
}
async function healthState(provider: string) {
  return (
    await db.query<Record<string, unknown>>(
      "SELECT status,observed_at,generation::text FROM model_provider_health_state WHERE provider_id=$1",
      [provider],
    )
  ).rows[0];
}
async function staleHealth(provider: string) {
  await db.query(
    "UPDATE model_provider_health_state SET observed_at=clock_timestamp()-INTERVAL '301 seconds',generation=generation+1 WHERE provider_id=$1",
    [provider],
  );
  await db.query(
    "UPDATE model_cache_generation SET generation=generation+1 WHERE scope='resolve'",
  );
}

describe("provider discovery real HTTP/PG and self-owned upstream", () => {
  it("discovers using encrypted stored credentials before any model or business route exists, with no local writes", async () => {
    const provider = await createProvider(),
      before = await catalogState(),
      start = sends;
    const result = await request(path(provider.id));
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.body).toEqual({
      data: {
        provider_id: provider.id,
        items: [{ id: "vendor/shared-model" }],
      },
    });
    expect(sends).toBe(start + 1);
    expect(await catalogState()).toEqual(before);
    expect(JSON.stringify(result.body)).not.toContain("fixture-key");
    const admin = await request(path(provider.id), "GET", undefined, {
      service: "system-admin",
    });
    expect(admin.response.status).toBe(200);
  });
  it("rejects forbidden callers, unknown query/body framing and command headers before contacting upstream", async () => {
    const provider = await createProvider(),
      start = sends;
    for (const service of ["web-bff", "kokoro-agent"] as const)
      expect(
        (await request(path(provider.id), "GET", undefined, { service }))
          .response.status,
      ).toBe(403);
    expect(
      (await request(path(provider.id) + "?url=ignored")).response.status,
    ).toBe(400);
    for (const headers of [
      { "content-length": "0" },
      { "idempotency-key": "fixture" },
      { "if-match": '"1"' },
      { "content-type": "application/json" },
      { "x-kokoro-actor-id": "a".repeat(161) },
      { "x-kokoro-tenant-id": "t".repeat(161) },
    ]) {
      // fetch strips an explicit Content-Length:0 on GET; use native HTTP to
      // prove the actual forbidden wire header reaches the owner guard.
      const result = await new Promise<{
        status: number;
        cache: string | undefined;
      }>((resolve, reject) => {
        const incoming = nativeRequest(
          `${base}/v1/system/${path(provider.id)}`,
          {
            headers: {
              authorization: `Bearer ${tokens["model-management"]}`,
              "x-kokoro-service": "model-management",
              "x-kokoro-tenant-id": "tenant-a",
              "x-kokoro-actor-id": "actor-a",
              "x-kokoro-iam-permissions": "system:write",
              ...headers,
            },
          },
          (response) => {
            response.resume();
            response.once("end", () =>
              resolve({
                status: response.statusCode!,
                cache: response.headers["cache-control"],
              }),
            );
          },
        );
        incoming.once("error", reject);
        incoming.end();
      });
      expect(result.status, Object.keys(headers)[0]).toBe(400);
      expect(result.cache).toBe("no-store");
    }
    expect(sends).toBe(start);
  });
  it("rejects deleted, erased and tampered credentials with zero upstream requests", async () => {
    const deleted = await createProvider(),
      erased = await createProvider(),
      tampered = await createProvider();
    await db.query(
      "UPDATE model_provider SET deleted_at=clock_timestamp(),deleted_by='fixture' WHERE id=$1",
      [deleted.id],
    );
    await db.query(
      "UPDATE model_provider_credential SET erased_at=clock_timestamp(),nonce=NULL,auth_tag=NULL,ciphertext=NULL WHERE provider_id=$1",
      [erased.id],
    );
    await db.query(
      "UPDATE model_provider_credential SET ciphertext=decode(repeat('00',octet_length(ciphertext)),'hex') WHERE provider_id=$1",
      [tampered.id],
    );
    const start = sends;
    for (const id of [deleted.id, erased.id])
      expect((await request(path(id))).response.status).toBe(404);
    const result = await request(path(tampered.id));
    expect(result.response.status).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("fixture-key");
    expect(sends).toBe(start);
  });
  it("rechecks deletion after the in-flight request without holding a database lock across the network", async () => {
    const provider = await createProvider();
    let release!: (response: ServerResponse) => void;
    const received = new Promise<ServerResponse>((resolve) => {
      release = resolve;
    });
    hold = release;
    const pending = request(path(provider.id));
    const response = await received;
    try {
      const removed = await request(
        `model-catalog/providers/${provider.id}`,
        "DELETE",
        undefined,
        { match: `"${provider.version}"` },
      );
      expect(removed.response.status).toBe(200);
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"data":[{"id":"late"}]}');
      expect((await pending).response.status).toBe(404);
    } finally {
      hold = undefined;
      response.end();
      await pending;
    }
  });
  it("bounds concurrency at eight and rejects a second same-provider request without sharing cancellation", async () => {
    const providers = await Promise.all(
      Array.from({ length: 9 }, () => createProvider()),
    );
    const held: ServerResponse[] = [];
    let ready!: () => void;
    const received = new Promise<void>((resolve) => {
      ready = resolve;
    });
    hold = (response) => {
      held.push(response);
      if (held.length === 8) ready();
    };
    const pending = providers
      .slice(0, 8)
      .map((provider) => request(path(provider.id)));
    try {
      await received;
      expect((await request(path(providers[0]!.id))).response.status).toBe(503);
      expect((await request(path(providers[8]!.id))).response.status).toBe(503);
    } finally {
      hold = undefined;
      for (const response of held) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"data":[]}');
      }
    }
    for (const result of await Promise.all(pending))
      expect(result.response.status).toBe(200);
  });
});

describe("route health uses the real bounded metadata connection", () => {
  it("bootstraps missing health, reuses fresh health and refreshes an expired observation", async () => {
    const route = await createRoute(),
      start = sends;
    expect(await healthState(route.provider)).toBeUndefined();
    const first = await resolveRoute(route.feature);
    expect(first.response.status).toBe(200);
    expect(first.body.data).toMatchObject({
      provider_id: route.provider,
      revision_id: route.revision,
    });
    expect(sends).toBe(start + 1);
    expect(await healthState(route.provider)).toMatchObject({
      status: "healthy",
      generation: "1",
    });
    expect((await resolveRoute(route.feature)).response.status).toBe(200);
    expect(sends).toBe(start + 1);
    const credential = await request(
      "model-catalog/credentials/read",
      "POST",
      {
        feature_key: route.feature,
        provider_id: route.provider,
        revision_id: route.revision,
        digest: first.body.data.digest,
      },
      { service: "kokoro-agent" },
    );
    expect(credential.response.status).toBe(200);
    expect(credential.body.data.api_key).toBe(
      "fixture-key-never-sent-to-model",
    );
    await staleHealth(route.provider);
    expect((await resolveRoute(route.feature)).response.status).toBe(200);
    expect(sends).toBe(start + 2);
    expect(await healthState(route.provider)).toMatchObject({
      status: "healthy",
      generation: "3",
    });
  });
  it("keeps fresh nonhealthy and invalid future observations authoritative with zero network", async () => {
    for (const status of ["unknown", "down", "degraded", "healthy"]) {
      const route = await createRoute();
      await db.query(
        "INSERT INTO model_provider_health_state(provider_id,status,observed_at) VALUES($1,$2,clock_timestamp()+($3::int*INTERVAL '1 second'))",
        [route.provider, status, status === "healthy" ? 60 : 0],
      );
      const before = await healthState(route.provider),
        start = sends;
      expect((await resolveRoute(route.feature)).response.status).toBe(503);
      expect(sends).toBe(start);
      expect(await healthState(route.provider)).toEqual(before);
    }
  });
  it("does not probe hidden, unpublished, retired, erased or foreign-tenant targets", async () => {
    for (const change of [
      "hidden",
      "unpublished",
      "retired",
      "erased",
      "foreign",
    ]) {
      const route = await createRoute(),
        start = sends;
      if (change === "hidden")
        await db.query(
          "UPDATE model_routing_policy SET visible=false WHERE label_id=$1",
          [route.label],
        );
      if (change === "unpublished") {
        // A separate draft binding, not mutation of an immutable publication.
        const draft = await request("model-catalog/revisions", "POST", {
          model_id: (await request(`model-catalog/revisions/${route.revision}`))
            .body.data.model_id,
          provider_id: route.provider,
          revision: 2,
          provider_model_name: "vendor/shared-model",
          request_model: "vendor/shared-model",
          display_name: "Draft",
          input_modalities: ["text"],
          output_modalities: ["text"],
          context_window: 4096,
          max_output_tokens: 128,
          priority: 0,
        });
        expect(draft.response.status).toBe(201);
        await db.query(
          "UPDATE model_routing_policy SET model_revision_id=$1 WHERE label_id=$2",
          [draft.body.data.id, route.label],
        );
      }
      if (change === "retired")
        // Corrupt/stale routing projection must still fail closed; normal
        // retirement already rejects active references in its own tests.
        await db.query(
          "UPDATE model_revision SET retired_at=clock_timestamp() WHERE id=$1",
          [route.revision],
        );
      if (change === "erased")
        await db.query(
          "UPDATE model_provider_credential SET erased_at=clock_timestamp(),nonce=NULL,auth_tag=NULL,ciphertext=NULL WHERE provider_id=$1",
          [route.provider],
        );
      const result =
        change === "foreign"
          ? await request(
              "model-catalog/resolve",
              "POST",
              { feature_key: route.feature },
              { service: "kokoro-agent", tenant: "tenant-b" },
            )
          : await resolveRoute(route.feature);
      expect(result.response.status).not.toBe(200);
      expect(sends).toBe(start);
      expect(await healthState(route.provider)).toBeUndefined();
    }
  });
  it("does not overwrite a concurrent administrator down observation or hold locks across the network", async () => {
    const route = await createRoute();
    let received!: (response: ServerResponse) => void;
    const arrived = new Promise<ServerResponse>((resolve) => {
      received = resolve;
    });
    hold = received;
    const pending = resolveRoute(route.feature),
      response = await arrived;
    try {
      const down = await request(
        `model-catalog/providers/${route.provider}/health`,
        "PUT",
        { status: "down", observed_at: new Date().toISOString() },
        { service: "system-admin", none: "*" },
      );
      expect(down.response.status).toBe(200);
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"data":[{"id":"vendor/shared-model"}]}');
      expect((await pending).response.status).toBe(503);
      expect(await healthState(route.provider)).toMatchObject({
        status: "down",
        generation: "1",
      });
    } finally {
      hold = undefined;
      response.end();
      await pending;
    }
  });
  it("rejects late probes after deletion or credential ciphertext changes", async () => {
    for (const change of ["deleted", "ciphertext"]) {
      const route = await createRoute();
      let received!: (response: ServerResponse) => void;
      const arrived = new Promise<ServerResponse>((resolve) => {
        received = resolve;
      });
      hold = received;
      const pending = resolveRoute(route.feature),
        response = await arrived;
      try {
        if (change === "deleted")
          await db.query(
            "UPDATE model_provider SET deleted_at=clock_timestamp(),deleted_by='fixture' WHERE id=$1",
            [route.provider],
          );
        else
          await db.query(
            "UPDATE model_provider_credential SET ciphertext=decode(repeat('00',octet_length(ciphertext)),'hex') WHERE provider_id=$1",
            [route.provider],
          );
        response.writeHead(200, { "content-type": "application/json" });
        response.end('{"data":[{"id":"vendor/shared-model"}]}');
        expect((await pending).response.status).not.toBe(200);
        expect(await healthState(route.provider)).toBeUndefined();
      } finally {
        hold = undefined;
        response.end();
        await pending;
      }
    }
  });
  it("does not turn a failed metadata response into health or negative-cache the failure", async () => {
    const route = await createRoute(),
      start = sends;
    hold = (response) => {
      response.writeHead(401);
      response.end("private-provider-error");
    };
    try {
      expect((await resolveRoute(route.feature)).response.status).toBe(503);
    } finally {
      hold = undefined;
    }
    expect(await healthState(route.provider)).toBeUndefined();
    expect((await resolveRoute(route.feature)).response.status).toBe(200);
    expect(sends).toBe(start + 2);
  });
  it("shares discovery's same-provider slot with resolve and only one missing-health observation commits", async () => {
    const route = await createRoute(),
      start = sends;
    let received!: (response: ServerResponse) => void;
    const arrived = new Promise<ServerResponse>((resolve) => {
      received = resolve;
    });
    hold = received;
    const pending = resolveRoute(route.feature),
      response = await arrived;
    try {
      expect((await resolveRoute(route.feature)).response.status).toBe(503);
      expect((await request(path(route.provider))).response.status).toBe(503);
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"data":[]}');
      expect((await pending).response.status).toBe(200);
      expect(sends).toBe(start + 1);
      expect(await healthState(route.provider)).toMatchObject({
        generation: "1",
      });
    } finally {
      hold = undefined;
      response.end();
      await pending;
    }
  });
  it("cancels an in-flight probe when its caller disconnects and never writes late health", async () => {
    const route = await createRoute();
    let received!: (response: ServerResponse) => void;
    const arrived = new Promise<ServerResponse>((resolve) => {
      received = resolve;
    });
    hold = received;
    const call = nativeRequest(`${base}/v1/system/model-catalog/resolve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens["kokoro-agent"]}`,
        "x-kokoro-service": "kokoro-agent",
        "x-kokoro-tenant-id": "tenant-a",
        "x-kokoro-actor-id": "actor-a",
      },
    });
    const disconnected = new Promise<void>((resolve) => {
      call.once("error", () => resolve());
    });
    call.end(JSON.stringify({ feature_key: route.feature }));
    const response = await arrived;
    const closed = once(response, "close");
    try {
      call.destroy(new Error("fixture disconnect"));
      await disconnected;
      await closed;
      expect(await healthState(route.provider)).toBeUndefined();
    } finally {
      hold = undefined;
      response.end();
      call.destroy();
    }
  });
});

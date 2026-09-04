import { request as httpRequest, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createHttpServer } from "../src/interfaces/http/server.js";
import { InMemorySystemControlRepository } from "./doubles/in-memory-system-control-repository.js";
import { SystemControlService } from "../src/application/system/services/system-control.service.js";
import type { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";

const manifestService: Pick<RuntimeManifestService, "get"> = {
  get: async () => ({
    tenantId: "tenant-a",
    productId: "p",
    locale: "en-US",
    navigation: [],
    localeNamespaces: [],
    theme: {},
    featureFlags: [],
    references: [],
    configVersion: "1",
    releaseId: null,
    digest: "d",
  }),
};
function createControlService(): SystemControlService {
  return new SystemControlService(new InMemorySystemControlRepository(), {
    invalidateTenant: async () => undefined,
  });
}
async function request(
  server: Server,
  path: string,
  init: Readonly<{
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }> = {},
): Promise<{ status: number; body: unknown; requestId: string | undefined }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server did not bind");
  try {
    return await new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: address.address,
          port: address.port,
          path,
          method: init.method ?? "GET",
          headers: init.headers,
        },
        (res) => {
          let raw = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            raw += chunk;
          });
          res.on("end", () => {
            const value = res.headers["x-kokoro-request-id"];
            const responseBody: unknown = JSON.parse(raw);
            resolve({
              status: res.statusCode ?? 0,
              body: responseBody,
              requestId: Array.isArray(value) ? value[0] : value,
            });
          });
        },
      );
      req.on("error", reject);
      if (init.body) req.write(init.body);
      req.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("System control HTTP contract", () => {
  it("exposes request_id, permission, pagination and idempotency semantics", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    const headers = {
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "service-token",
      "x-kokoro-iam-permissions": "system:write,system:read",
      "x-kokoro-request-id": "00000000-0000-4000-8000-000000000010",
      "idempotency-key": "site-command",
    };
    const first = await request(server, "/v1/system/sites", {
      method: "POST",
      headers,
      body: JSON.stringify({
        site_key: "main",
        hostname: "a.example.test",
        display_name: "A",
      }),
    });
    expect(first.status).toBe(201);
    expect(first.requestId).toBe(headers["x-kokoro-request-id"]);
    expect(first.body).toMatchObject({
      data: { site_key: "main" },
      meta: { request_id: headers["x-kokoro-request-id"] },
    });
    expect(first.body).not.toHaveProperty("data.siteKey");
    expect(first.body).not.toHaveProperty("requestId");
    const replay = await request(server, "/v1/system/sites", {
      method: "POST",
      headers,
      body: JSON.stringify({
        site_key: "main",
        hostname: "a.example.test",
        display_name: "A",
      }),
    });
    expect(replay.body).toEqual(first.body);
    const listed = await request(server, "/v1/system/sites?limit=1", {
      headers: {
        "x-kokoro-tenant-id": "tenant-a",
        "x-kokoro-service": "web-bff",
        "x-kokoro-internal-secret": "service-token",
        "x-kokoro-iam-permissions": "system:read",
      },
    });
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({
      data: { items: [{ site_key: "main" }], next_cursor: null },
      meta: { request_id: expect.any(String) },
    });
  });

  it("does not let a tenant without the IAM permission write a site", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    const result = await request(server, "/v1/system/sites", {
      method: "POST",
      headers: {
        "x-kokoro-tenant-id": "tenant-a",
        "x-kokoro-service": "web-bff",
        "x-kokoro-internal-secret": "service-token",
        "x-kokoro-iam-permissions": "system:read",
        "idempotency-key": "denied",
      },
      body: JSON.stringify({
        site_key: "main",
        hostname: "a.example.test",
        display_name: "A",
      }),
    });
    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: { code: "FORBIDDEN", message: "permission denied" },
      meta: { request_id: expect.any(String) },
    });
  });

  it("rejects undeclared and wrongly typed wire fields", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    const headers = {
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "service-token",
      "x-kokoro-iam-permissions": "system:write",
      "idempotency-key": "strict-wire",
    };
    const undeclared = await request(server, "/v1/system/sites", {
      method: "POST",
      headers,
      body: JSON.stringify({
        site_key: "main",
        hostname: "a.example.test",
        display_name: "A",
        displayName: "camel-case-must-not-cross-wire",
      }),
    });
    expect(undeclared.status).toBe(400);

    const wrongNullableType = await request(server, "/v1/system/config", {
      method: "POST",
      headers: { ...headers, "idempotency-key": "strict-config-wire" },
      body: JSON.stringify({
        module_key: "theme",
        config_key: "default",
        scope_type: "tenant",
        scope_id: "tenant-a",
        product_id: 42,
        locale: null,
        value: {},
        schema_version: 1,
        release_id: null,
      }),
    });
    expect(wrongNullableType.status).toBe(400);
  });

  it("removes the legacy and pseudo-RPC JSON paths", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      bffServiceToken: "service-token",
    });
    for (const path of [
      "/system/runtime-manifest?product_id=p",
      "/system/sites",
      "/rpc/kokoro.system.v1.SystemService/GetRuntimeManifest",
    ]) {
      const result = await request(server, path, {
        headers: {
          "x-kokoro-tenant-id": "tenant-a",
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": "service-token",
        },
      });
      expect(result.status).toBe(404);
    }
  });

  it("requires configured BFF auth for control-plane routes", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    const baseHeaders = {
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-iam-permissions": "system:read",
    };
    const missingAuth = await request(server, "/v1/system/sites", {
      headers: baseHeaders,
    });
    expect(missingAuth.status).toBe(403);
    const valid = await request(server, "/v1/system/sites", {
      headers: {
        ...baseHeaders,
        "x-kokoro-service": "web-bff",
        authorization: "Bearer service-token",
      },
    });
    expect(valid.status).toBe(200);
  });

  it("fails closed when BFF service auth is not configured", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
    });
    const result = await request(server, "/v1/system/sites", {
      headers: {
        "x-kokoro-tenant-id": "tenant-a",
        "x-kokoro-service": "web-bff",
        "x-kokoro-internal-secret": "service-token",
        "x-kokoro-iam-permissions": "system:read",
      },
    });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({
      error: {
        code: "service_auth_not_configured",
        message: "system service authentication is not configured",
      },
      meta: { request_id: expect.any(String) },
    });
  });

  it("rejects malformed query, path and trusted-header values at the HTTP boundary", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    const baseHeaders = {
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "service-token",
      "x-kokoro-iam-permissions": "system:read",
    };

    await expect(
      request(server, "/v1/system/sites?limit=not-a-number", {
        headers: baseHeaders,
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: { code: "INVALID_ARGUMENT", message: "limit is invalid" },
      },
    });
    await expect(
      request(server, "/v1/system/sites/not-a-uuid/policy", {
        headers: baseHeaders,
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: { code: "INVALID_ARGUMENT", message: "site_id is invalid" },
      },
    });
    await expect(
      request(server, "/v1/system/sites", {
        headers: { ...baseHeaders, "x-kokoro-request-id": "not-a-uuid" },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: "INVALID_ARGUMENT",
          message: "x-kokoro-request-id is invalid",
        },
      },
    });
  });

  it("rejects an oversized Content-Length before reading the request body", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    await expect(
      request(server, "/v1/system/sites", {
        method: "POST",
        headers: {
          "x-kokoro-tenant-id": "tenant-a",
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": "service-token",
          "x-kokoro-iam-permissions": "system:write",
          "idempotency-key": "oversized-body",
          "content-length": "1000001",
        },
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: "INVALID_ARGUMENT",
          message: "request body is too large",
        },
      },
    });
  });

  it("rejects a release body that does not satisfy the wire digest schema", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: createControlService(),
      bffServiceToken: "service-token",
    });
    await expect(
      request(server, "/v1/system/releases", {
        method: "POST",
        headers: {
          "x-kokoro-tenant-id": "tenant-a",
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": "service-token",
          "x-kokoro-iam-permissions": "system:write",
          "idempotency-key": "invalid-release-digest",
        },
        body: JSON.stringify({ release_key: "release", digest: "not-hex" }),
      }),
    ).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: "INVALID_ARGUMENT",
          message: "digest is invalid",
        },
      },
    });
  });
});

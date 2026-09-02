import { request as httpRequest, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createHttpServer } from "../src/interfaces/http/server.js";
import type { RuntimeManifestService } from "../src/modules/runtime-manifest/service.js";

function serviceStub(): RuntimeManifestService {
  return {
    get: async () => ({
      tenantId: "tenant-a",
      productId: "product-a",
      locale: "en-US",
      navigation: [],
      localeNamespaces: [],
      theme: {},
      featureFlags: [],
      references: [],
      configVersion: "1",
      releaseId: null,
      digest: "digest",
    }),
  } as unknown as RuntimeManifestService;
}

async function getJson(server: Server, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: unknown }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try {
    return await new Promise((resolve, reject) => {
      const request = httpRequest({ host: address.address, port: address.port, path, method: "GET", headers }, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) as unknown }));
      });
      request.on("error", reject);
      request.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("System HTTP contract", () => {
  it("returns 400 when the tenant context header is missing", async () => {
    const server = createHttpServer(serviceStub(), async () => true, { bffServiceToken: "service-token" });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token" })).resolves.toEqual({
      status: 400,
      body: {
        error: { code: "INVALID_ARGUMENT", message: "x-kokoro-tenant-id is required" },
        meta: { request_id: expect.any(String) },
      },
    });
  });

  it("returns 503 when readiness dependencies fail and preserves request id", async () => {
    const server = createHttpServer(serviceStub(), async () => { throw new Error("dependency fixture down"); }, { bffServiceToken: "service-token" });
    await expect(getJson(server, "/readyz")).resolves.toMatchObject({
      status: 503,
      body: { error: { code: "SYSTEM_UNAVAILABLE", message: "system unavailable" }, meta: { request_id: expect.any(String) } },
    });
  });

  it("keeps health and readiness public when BFF service auth is enabled", async () => {
    const server = createHttpServer(serviceStub(), async () => true, { bffServiceToken: "service-token" });
    await expect(getJson(server, "/healthz")).resolves.toMatchObject({
      status: 200,
      body: { data: { status: "ok", service: "kokoro-system" }, meta: { request_id: expect.any(String) } },
    });
    await expect(getJson(server, "/readyz")).resolves.toMatchObject({
      status: 200,
      body: { data: { status: "ready", service: "kokoro-system" }, meta: { request_id: expect.any(String) } },
    });
  });

  it("requires web-bff service auth before runtime manifest access", async () => {
    const server = createHttpServer(serviceStub(), async () => true, { bffServiceToken: "service-token" });
    const tenant = { "x-kokoro-tenant-id": "tenant-a" };
    const expected = { error: { code: "service_auth_failed", message: "service authentication failed" }, meta: { request_id: expect.any(String) } };
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", tenant)).resolves.toEqual({ status: 403, body: expected });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...tenant, "x-kokoro-service": "not-web-bff", "x-kokoro-internal-secret": "service-token" })).resolves.toEqual({ status: 403, body: expected });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...tenant, "x-kokoro-service": "web-bff" })).resolves.toEqual({ status: 403, body: expected });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...tenant, "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "wrong-token" })).resolves.toEqual({ status: 403, body: expected });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...tenant, "x-kokoro-service": "web-bff", "x-kokoro-service-token": "service-token" })).resolves.toEqual({ status: 403, body: expected });
  });

  it("accepts the BFF internal secret or service bearer and still requires tenant context", async () => {
    const server = createHttpServer(serviceStub(), async () => true, { bffServiceToken: "service-token" });
    const common = { "x-kokoro-service": "web-bff", "x-kokoro-tenant-id": "tenant-a" };
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...common, "x-kokoro-internal-secret": "service-token" })).resolves.toMatchObject({ status: 200, body: { data: expect.any(Object), meta: { request_id: expect.any(String) } } });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { ...common, authorization: "Bearer service-token" })).resolves.toMatchObject({ status: 200, body: { data: expect.any(Object), meta: { request_id: expect.any(String) } } });
    await expect(getJson(server, "/system/runtime-manifest?product_id=product-a", { "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token" })).resolves.toEqual({
      status: 400,
      body: { error: { code: "INVALID_ARGUMENT", message: "x-kokoro-tenant-id is required" }, meta: { request_id: expect.any(String) } },
    });
  });

  it("does not expose an unauthenticated System path when service auth is enabled", async () => {
    const server = createHttpServer(serviceStub(), async () => true, { bffServiceToken: "service-token" });
    await expect(getJson(server, "/system/not-a-route")).resolves.toEqual({
      status: 403,
      body: { error: { code: "service_auth_failed", message: "service authentication failed" }, meta: { request_id: expect.any(String) } },
    });
  });
});

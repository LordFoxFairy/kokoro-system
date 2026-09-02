import { request as httpRequest, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createHttpServer } from "../src/interfaces/http/server.js";
import { InMemorySystemControlRepository } from "../src/modules/system/in-memory-repository.js";
import { SystemControlService } from "../src/modules/system/service.js";
import type { RuntimeManifestService } from "../src/modules/runtime-manifest/service.js";

const manifestService = { get: async () => ({ tenantId: "tenant-a", productId: "p", locale: "en-US", navigation: [], localeNamespaces: [], theme: {}, featureFlags: [], references: [], configVersion: "1", releaseId: null, digest: "d" }) } as unknown as RuntimeManifestService;
async function request(server: Server, path: string, init: Readonly<{ method?: string; headers?: Record<string, string>; body?: string }> = {}): Promise<{ status: number; body: unknown; requestId: string | undefined }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("server did not bind");
  try { return await new Promise((resolve, reject) => { const req = httpRequest({ host: address.address, port: address.port, path, method: init.method ?? "GET", headers: init.headers }, (res) => { let raw = ""; res.setEncoding("utf8"); res.on("data", (chunk: string) => { raw += chunk; }); res.on("end", () => { const value = res.headers["x-kokoro-request-id"]; resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) as unknown, requestId: Array.isArray(value) ? value[0] : value }); }); }); req.on("error", reject); if (init.body) req.write(init.body); req.end(); }); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("System control HTTP contract", () => {
  it("exposes request_id, permission, pagination and idempotency semantics", async () => {
    const server = createHttpServer(manifestService, async () => true, { control: new SystemControlService(new InMemorySystemControlRepository()), bffServiceToken: "service-token" });
    const headers = { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token", "x-kokoro-iam-permissions": "system:write,system:read", "x-kokoro-request-id": "00000000-0000-4000-8000-000000000010", "idempotency-key": "site-command" };
    const first = await request(server, "/system/sites", { method: "POST", headers, body: JSON.stringify({ site_key: "main", hostname: "a.example.test", display_name: "A" }) });
    expect(first.status).toBe(201); expect(first.requestId).toBe(headers["x-kokoro-request-id"]);
    expect(first.body).toMatchObject({ data: { siteKey: "main" }, meta: { request_id: headers["x-kokoro-request-id"] } });
    expect(first.body).not.toHaveProperty("requestId");
    const replay = await request(server, "/system/sites", { method: "POST", headers, body: JSON.stringify({ site_key: "main", hostname: "a.example.test", display_name: "A" }) });
    expect(replay.body).toEqual(first.body);
    const listed = await request(server, "/system/sites?limit=1", { headers: { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token", "x-kokoro-iam-permissions": "system:read" } });
    expect(listed.status).toBe(200); expect(listed.body).toMatchObject({ data: { items: [{ siteKey: "main" }] }, meta: { request_id: expect.any(String) } });
  });

  it("does not let a tenant without the IAM permission write a site", async () => {
    const server = createHttpServer(manifestService, async () => true, { control: new SystemControlService(new InMemorySystemControlRepository()), bffServiceToken: "service-token" });
    const result = await request(server, "/system/sites", { method: "POST", headers: { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token", "x-kokoro-iam-permissions": "system:read", "idempotency-key": "denied" }, body: JSON.stringify({ site_key: "main", hostname: "a.example.test", display_name: "A" }) });
    expect(result.status).toBe(403); expect(result.body).toEqual({ error: { code: "FORBIDDEN", message: "permission denied" }, meta: { request_id: expect.any(String) } });
  });

  it("routes the RPC manifest fixture to the same manifest service", async () => {
    const server = createHttpServer(manifestService, async () => true, { bffServiceToken: "service-token" });
    const result = await request(server, "/rpc/kokoro.system.v1.SystemService/GetRuntimeManifest", { method: "POST", headers: { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token", "content-type": "application/json" }, body: JSON.stringify({ product_id: "p", locale: "en-US" }) });
    expect(result.status).toBe(200); expect(result.body).toMatchObject({ data: { tenantId: "tenant-a", productId: "p" }, meta: { request_id: expect.any(String) } });
  });

  it("requires configured BFF auth for control-plane routes", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      control: new SystemControlService(new InMemorySystemControlRepository()),
      bffServiceToken: "service-token",
    });
    const baseHeaders = { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-iam-permissions": "system:read" };
    const missingAuth = await request(server, "/system/sites", { headers: baseHeaders });
    expect(missingAuth.status).toBe(403);
    const valid = await request(server, "/system/sites", { headers: { ...baseHeaders, "x-kokoro-service": "web-bff", authorization: "Bearer service-token" } });
    expect(valid.status).toBe(200);
  });

  it("fails closed when BFF service auth is not configured", async () => {
    const server = createHttpServer(manifestService, async () => true, { control: new SystemControlService(new InMemorySystemControlRepository()) });
    const result = await request(server, "/system/sites", { headers: { "x-kokoro-tenant-id": "tenant-a", "x-kokoro-service": "web-bff", "x-kokoro-internal-secret": "service-token", "x-kokoro-iam-permissions": "system:read" } });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: { code: "service_auth_not_configured", message: "system service authentication is not configured" }, meta: { request_id: expect.any(String) } });
  });
});

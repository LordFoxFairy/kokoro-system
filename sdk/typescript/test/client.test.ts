import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { createSystemClient } from "../src/index.js";
import type { SystemSdkError } from "../src/index.js";

const manifest = {
  tenantId: "tenant-1",
  productId: "admin",
  locale: "zh-CN",
  navigation: [],
  localeNamespaces: ["admin"],
  theme: { mode: "light" },
  featureFlags: [],
  references: [],
  configVersion: "7",
  releaseId: "release-1",
  digest: "sha256:fixture",
};
const wireManifest = {
  tenant_id: "tenant-1",
  product_id: "admin",
  locale: "zh-CN",
  navigation: [],
  locale_namespaces: ["admin"],
  theme: { mode: "light" },
  feature_flags: [],
  references: [],
  config_version: "7",
  release_id: "release-1",
  digest: "sha256:fixture",
};

describe("System SDK client", () => {
  it("requests a runtime manifest with trusted tenant context", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push({ input, init });
      return new Response(JSON.stringify({ data: wireManifest }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createSystemClient({
      baseUrl: "http://system.example.test/api/",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      serviceToken: "workload-token",
      actorId: "user-1",
      requestId: () => "00000000-0000-4000-8000-000000000001",
      fetch: fetcher,
    });

    await expect(
      client.getRuntimeManifest({
        productId: "admin",
        locale: "zh-CN",
        surfaceId: "admin-web",
      }),
    ).resolves.toEqual(manifest);

    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "http://system.example.test/api/v1/system/runtime-manifest?product_id=admin&locale=zh-CN&surface_id=admin-web",
    );
    expect(calls[0]?.init?.headers).toEqual({
      authorization: "Bearer workload-token",
      host: "tenant.example.test",
      "x-kokoro-internal-secret": "workload-token",
      "x-kokoro-actor-id": "user-1",
      "x-kokoro-request-id": "00000000-0000-4000-8000-000000000001",
      "x-kokoro-service": "web-bff",
      "x-kokoro-tenant-id": "tenant-1",
    });
  });

  it("surfaces a stable error for a non-success response", async () => {
    const client = createSystemClient({
      baseUrl: "http://system.example.test",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      requestId: () => "00000000-0000-4000-8000-000000000002",
      fetch: async () =>
        new Response(JSON.stringify({ error: "not_ready" }), { status: 503 }),
    });

    await expect(
      client.getRuntimeManifest({ productId: "admin" }),
    ).rejects.toMatchObject<SystemSdkError>({
      name: "SystemSdkError",
      status: 503,
      code: "HTTP_503",
      requestId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("rejects a response that does not contain the contract data", async () => {
    const client = createSystemClient({
      baseUrl: "http://system.example.test",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      fetch: async () =>
        new Response(JSON.stringify({ data: { productId: "admin" } }), {
          status: 200,
        }),
    });

    await expect(
      client.getRuntimeManifest({ productId: "admin" }),
    ).rejects.toThrow("runtime manifest response is invalid");
  });

  it.each(["01", "-1", "1.0", "1e3", "not-a-decimal"])(
    "rejects non-canonical config_version %s",
    async (configVersion) => {
      const client = createSystemClient({
        baseUrl: "http://system.example.test",
        tenantId: "tenant-1",
        tenantHost: "tenant.example.test",
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: { ...wireManifest, config_version: configVersion },
            }),
            { status: 200 },
          ),
      });

      await expect(
        client.getRuntimeManifest({ productId: "admin" }),
      ).rejects.toThrow("runtime manifest response is invalid");
    },
  );

  it.each(["0", "9007199254740993"])(
    "preserves canonical config_version %s",
    async (configVersion) => {
      const client = createSystemClient({
        baseUrl: "http://system.example.test",
        tenantId: "tenant-1",
        tenantHost: "tenant.example.test",
        fetch: async () =>
          new Response(
            JSON.stringify({
              data: { ...wireManifest, config_version: configVersion },
            }),
            { status: 200 },
          ),
      });

      await expect(
        client.getRuntimeManifest({ productId: "admin" }),
      ).resolves.toMatchObject({ configVersion });
    },
  );

  it.each([
    [
      "malformed JSON",
      new Response("{", { status: 200 }),
      "INVALID_RESPONSE",
      200,
    ],
    [
      "missing data",
      new Response(JSON.stringify({}), { status: 200 }),
      "INVALID_RESPONSE",
      200,
    ],
    [
      "client error",
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
      "HTTP_403",
      403,
    ],
    [
      "server error",
      new Response("not-json", { status: 500 }),
      "HTTP_500",
      500,
    ],
  ])(
    "maps %s to a stable SystemSdkError",
    async (_label, response, code, status) => {
      const requestId = "00000000-0000-4000-8000-000000000004";
      const client = createSystemClient({
        baseUrl: "http://system.example.test",
        tenantId: "tenant-1",
        tenantHost: "tenant.example.test",
        requestId: () => requestId,
        fetch: async () => response,
      });

      await expect(
        client.getRuntimeManifest({ productId: "admin" }),
      ).rejects.toMatchObject<SystemSdkError>({
        name: "SystemSdkError",
        status,
        code,
        requestId,
      });
    },
  );

  it("does not carry provider secrets or internal URLs through error details", async () => {
    const workloadToken = "workload-token-that-must-not-escape";
    const internalUrl = "postgresql://postgres.internal.example.test:5432/private";
    const client = createSystemClient({
      baseUrl: "http://system.example.test",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      workloadToken,
      requestId: () => "00000000-0000-4000-8000-000000000007",
      fetch: async () =>
        new Response(
          JSON.stringify({
            code: "UPSTREAM_FAILURE",
            authorization: `Bearer ${workloadToken}`,
            internalUrl,
            databasePassword: "db-secret",
          }),
          { status: 502 },
        ),
    });

    const error = await client
      .getRuntimeManifest({ productId: "admin" })
      .catch((value: unknown) => value as SystemSdkError);
    expect(error).toMatchObject({
      code: "HTTP_502",
      details: { code: "UPSTREAM_FAILURE" },
    });
    expect(JSON.stringify(error)).not.toContain(workloadToken);
    expect(JSON.stringify(error)).not.toContain(internalUrl);
    expect(JSON.stringify(error)).not.toContain("db-secret");
  });

  it("maps an aborted fetch to TIMEOUT without retrying", async () => {
    let calls = 0;
    const client = createSystemClient({
      baseUrl: "http://system.example.test",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      timeoutMs: 5,
      requestId: () => "00000000-0000-4000-8000-000000000005",
      fetch: (_input, init) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        });
      },
    });

    await expect(
      client.getRuntimeManifest({ productId: "admin" }),
    ).rejects.toMatchObject<SystemSdkError>({
      code: "TIMEOUT",
      status: 408,
    });
    expect(calls).toBe(1);
  });

  it("maps network failures without exposing the request URL", async () => {
    const client = createSystemClient({
      baseUrl: "http://internal-system.example.test/private",
      tenantId: "tenant-1",
      tenantHost: "tenant.example.test",
      requestId: () => "00000000-0000-4000-8000-000000000006",
      fetch: async () => {
        throw new Error("connect ECONNREFUSED internal-system.example.test");
      },
    });

    const error = await client
      .getRuntimeManifest({ productId: "admin" })
      .catch((value: unknown) => value);
    expect(error).toMatchObject<SystemSdkError>({
      code: "NETWORK_ERROR",
      status: 0,
    });
    expect((error as SystemSdkError).details).toBeUndefined();
    expect((error as Error).message).not.toContain(
      "internal-system.example.test",
    );
  });

  it("preserves the tenant Host header with the default Node transport", async () => {
    let observedHost: string | undefined;
    const server = createServer((request, response) => {
      observedHost = request.headers.host;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: wireManifest }));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server did not bind");

    try {
      await expect(
        createSystemClient({
          baseUrl: `http://127.0.0.1:${address.port}`,
          tenantId: "tenant-1",
          tenantHost: "tenant.example.test",
          requestId: () => "00000000-0000-4000-8000-000000000003",
        }).getRuntimeManifest({ productId: "admin" }),
      ).resolves.toEqual(manifest);
      expect(observedHost).toBe("tenant.example.test");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

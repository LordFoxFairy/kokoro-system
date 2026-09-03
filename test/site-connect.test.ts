import { request as httpRequest, type Server } from "node:http";
import { describe, expect, it } from "vitest";
import { createHttpServer } from "../src/interfaces/http/server.js";
import type { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";

const manifestService: Pick<RuntimeManifestService, "get"> = {
  get: async () => {
    throw new Error("manifest service is not used by SiteService");
  },
};

async function connectRequest(
  server: Server,
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; body: unknown }> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("server did not bind");
  try {
    return await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: address.address,
          port: address.port,
          path,
          method: "POST",
          headers: {
            "content-type": "application/json",
            "connect-protocol-version": "1",
            ...headers,
          },
        },
        (response) => {
          let raw = "";
          response.setEncoding("utf8");
          response.on("data", (chunk: string) => {
            raw += chunk;
          });
          response.on("end", () => {
            const responseBody: unknown = JSON.parse(raw);
            resolve({
              status: response.statusCode ?? 0,
              body: responseBody,
            });
          });
        },
      );
      request.on("error", reject);
      request.end(JSON.stringify(body));
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("generated SiteService Connect handler", () => {
  it("serves ResolveSiteByHost from the generated service descriptor", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      bffServiceToken: "service-token",
      siteQuery: {
        resolveSiteByHost: async () => ({
          siteId: "00000000-0000-4000-8000-000000000001",
          key: "main",
          canonicalHost: "tenant.example.test",
          defaultLocale: "en-US",
          timezone: "America/New_York",
          generation: 7,
        }),
      },
    });

    await expect(
      connectRequest(
        server,
        "/kokoro.site.v1.SiteService/ResolveSiteByHost",
        {
          "x-kokoro-service": "web-bff",
          "x-kokoro-internal-secret": "service-token",
          "x-kokoro-tenant-id": "tenant-a",
          "x-kokoro-request-id": "00000000-0000-4000-8000-000000000009",
        },
        {
          host: "tenant.example.test",
          requestId: "00000000-0000-4000-8000-000000000009",
        },
      ),
    ).resolves.toEqual({
      status: 200,
      body: {
        siteId: "00000000-0000-4000-8000-000000000001",
        key: "main",
        canonicalHost: "tenant.example.test",
        defaultLocale: "en-US",
        timezone: "America/New_York",
        generation: "7",
      },
    });
  });

  it("enforces BFF service auth before SiteService resolution", async () => {
    const server = createHttpServer(manifestService, async () => true, {
      bffServiceToken: "service-token",
      siteQuery: {
        resolveSiteByHost: async () => {
          throw new Error("must not resolve without service auth");
        },
      },
    });
    const result = await connectRequest(
      server,
      "/kokoro.site.v1.SiteService/ResolveSiteByHost",
      { "x-kokoro-tenant-id": "tenant-a" },
      { host: "tenant.example.test" },
    );
    expect(result.status).toBe(403);
  });
});

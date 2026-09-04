import { request as httpRequest, type Server } from "node:http";
import { describe, expect, it } from "vitest";

import type { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
import { createHttpServer } from "../src/interfaces/http/server.js";
import type { StructuredLogEntry } from "../src/interfaces/observability/structured-logger.js";

function serviceStub(): Pick<RuntimeManifestService, "get"> {
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
  };
}

async function request(server: Server): Promise<void> {
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test server did not bind");
  try {
    await new Promise<void>((resolve, reject) => {
      const outgoing = httpRequest(
        {
          host: address.address,
          port: address.port,
          path: "/healthz",
          headers: {
            "x-kokoro-request-id": "00000000-0000-4000-8000-000000000011",
            "x-kokoro-trace-id": "trace-a",
          },
        },
        (response) => {
          response.resume();
          response.on("end", resolve);
        },
      );
      outgoing.on("error", reject);
      outgoing.end();
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("structured request logging", () => {
  it("emits the required production fields from injected logger", async () => {
    const entries: StructuredLogEntry[] = [];
    const server = createHttpServer(serviceStub(), async () => true, {
      logger: { write: (entry) => entries.push(entry) },
    });

    await request(server);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      service: "kokoro-system",
      operation: "http.GET.healthz",
      request_id: "00000000-0000-4000-8000-000000000011",
      trace_id: "trace-a",
      result: "success",
      duration_ms: expect.any(Number),
    });
  });
});

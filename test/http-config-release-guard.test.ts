import type { Server } from "node:http";
import { describe, expect, it } from "vitest";

import type { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
import { SystemControlService } from "../src/application/system/services/system-control.service.js";
import type { TenantRequestContext } from "../src/domain/runtime-manifest/models/index.js";
import type { ConfigRelease } from "../src/domain/system/models/index.js";
import { createHttpServer } from "../src/interfaces/http/server.js";
import { InMemorySystemControlRepository } from "./doubles/in-memory-system-control-repository.js";

const manifestService: Pick<RuntimeManifestService, "get"> = {
  get: async () => ({
    tenantId: "tenant-a",
    productId: "product-a",
    locale: "en-US",
    navigation: [],
    localeNamespaces: [],
    theme: {},
    featureFlags: [],
    references: [],
    configVersion: "0",
    releaseId: null,
    digest: "digest",
  }),
};

function context(tenantId: string): TenantRequestContext {
  return {
    tenantId,
    actorId: "00000000-0000-4000-8000-000000000001",
    organizationId: null,
    surfaceId: null,
    permissions: ["system:write", "system:publish"],
    correlationId: "00000000-0000-4000-8000-000000000002",
  };
}

async function releaseInState(
  control: SystemControlService,
  tenantId: string,
  state: ConfigRelease["status"],
): Promise<ConfigRelease> {
  const tenantContext = context(tenantId);
  const suffix = `${tenantId}-${state}`;
  const release = await control.createRelease(
    tenantContext,
    { releaseKey: suffix, digest: "a".repeat(64) },
    `create-${suffix}`,
  );
  if (state === "draft") return release;
  const validated = await control.validateRelease(
    tenantContext,
    release.id,
    `validate-${suffix}`,
  );
  if (state === "validated") return validated;
  const published = await control.publishRelease(
    tenantContext,
    release.id,
    `publish-${suffix}`,
  );
  if (state === "published") return published;
  return control.retireRelease(
    tenantContext,
    release.id,
    `retire-${suffix}`,
  );
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("HTTP release guard server did not bind");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

async function writeConfig(
  baseUrl: string,
  releaseId: string,
  configKey: string,
): Promise<Readonly<{ status: number; body: unknown }>> {
  const response = await fetch(`${baseUrl}/v1/system/config`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-kokoro-tenant-id": "tenant-a",
      "x-kokoro-service": "web-bff",
      "x-kokoro-internal-secret": "service-token",
      "x-kokoro-iam-permissions": "system:write",
      "idempotency-key": `write-${configKey}`,
    },
    body: JSON.stringify({
      module_key: "theme",
      config_key: configKey,
      scope_type: "tenant",
      scope_id: "tenant-a",
      product_id: null,
      locale: "en-US",
      value: { mode: "dark" },
      schema_version: 1,
      release_id: releaseId,
    }),
  });
  return { status: response.status, body: await response.json() };
}

describe("System config release HTTP guard", () => {
  it("accepts writable releases and maps immutable or foreign releases to stable errors", async () => {
    const control = new SystemControlService(
      new InMemorySystemControlRepository(),
      { invalidateTenant: async () => undefined },
    );
    const draft = await releaseInState(control, "tenant-a", "draft");
    const validated = await releaseInState(
      control,
      "tenant-a",
      "validated",
    );
    const published = await releaseInState(
      control,
      "tenant-a",
      "published",
    );
    const retired = await releaseInState(control, "tenant-a", "retired");
    const foreign = await releaseInState(control, "tenant-b", "draft");
    const server = createHttpServer(manifestService, async () => true, {
      control,
      bffServiceToken: "service-token",
    });
    const baseUrl = await listen(server);

    try {
      for (const [state, release] of [
        ["draft", draft],
        ["validated", validated],
      ] as const)
        await expect(
          writeConfig(baseUrl, release.id, state),
        ).resolves.toMatchObject({
          status: 201,
          body: {
            data: { release_id: release.id, config_version: "1" },
          },
        });

      for (const [state, release] of [
        ["published", published],
        ["retired", retired],
      ] as const)
        await expect(
          writeConfig(baseUrl, release.id, state),
        ).resolves.toMatchObject({
          status: 400,
          body: {
            error: {
              code: "INVALID_STATE",
              message: "release is not writable",
            },
          },
        });

      await expect(
        writeConfig(baseUrl, foreign.id, "foreign"),
      ).resolves.toMatchObject({
        status: 404,
        body: {
          error: { code: "NOT_FOUND", message: "release not found" },
        },
      });
    } finally {
      await close(server);
    }
  });
});

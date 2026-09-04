import { describe, expect, it } from "vitest";
import { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
import type {
  ManifestCache,
  SiteHostResolver,
  SystemRepository,
} from "../src/application/runtime-manifest/ports/index.js";
import type { RuntimeManifest } from "../src/domain/runtime-manifest/models/index.js";
import { SystemControlService } from "../src/application/system/services/system-control.service.js";
import { InMemorySystemControlRepository } from "./doubles/in-memory-system-control-repository.js";
const manifest: RuntimeManifest = {
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
};
function setup() {
  let calls = 0;
  const repository: SystemRepository = {
    getManifestGeneration: async () => "0",
    getManifest: async () => {
      calls += 1;
      return manifest;
    },
  };
  let cached: RuntimeManifest | null = null;
  const cache: ManifestCache = {
    get: async () => cached,
    set: async (_key, value) => {
      cached = value;
    },
    delete: async () => {
      cached = null;
    },
    assertReady: async () => undefined,
  };
  const hostResolver: SiteHostResolver = {
    resolve: async ({ context }) => {
      if (context.tenantId !== "tenant-a")
        throw new Error("site host does not match tenant context");
      return {
        siteId: "site-a",
        key: "main",
        canonicalHost: "app.example",
        defaultLocale: "en-US",
        timezone: "UTC",
        generation: "1",
      };
    },
  };
  return {
    service: new RuntimeManifestService(repository, cache, hostResolver),
    calls: () => calls,
    setCache: (value: RuntimeManifest) => {
      cached = value;
    },
  };
}
describe("RuntimeManifestService", () => {
  it("verifies the System-owned Site/Host binding and caches by tenant/product/locale", async () => {
    const value = setup();
    const context = {
      tenantId: "tenant-a",
      actorId: null,
      organizationId: null,
      surfaceId: null,
      permissions: [],
      correlationId: "request-a",
    } as const;
    await expect(
      value.service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "app.example",
      }),
    ).resolves.toEqual(manifest);
    await expect(
      value.service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "app.example",
      }),
    ).resolves.toEqual(manifest);
    expect(value.calls()).toBe(1);
  });
  it("rejects a forged tenant context", async () => {
    const value = setup();
    await expect(
      value.service.get({
        context: {
          tenantId: "tenant-b",
          actorId: null,
          organizationId: null,
          surfaceId: null,
          permissions: [],
          correlationId: "request-a",
        },
        productId: "product-a",
        locale: "en-US",
        host: "app.example",
      }),
    ).rejects.toThrow("site host does not match tenant context");
  });
  it("rejects a cache value whose identity does not match", async () => {
    const value = setup();
    value.setCache({ ...manifest, tenantId: "tenant-b" });
    await expect(
      value.service.get({
        context: {
          tenantId: "tenant-a",
          actorId: null,
          organizationId: null,
          surfaceId: null,
          permissions: [],
          correlationId: "request-a",
        },
        productId: "product-a",
        locale: "en-US",
        host: "app.example",
      }),
    ).rejects.toThrow("cache identity mismatch");
  });
});

it("keeps surface-specific manifests separate from the default manifest cache entry", async () => {
  const values = new Map<string, RuntimeManifest>();
  const keys: string[] = [];
  const repository: SystemRepository = {
    getManifestGeneration: async () => "0",
    getManifest: async ({ context }) => ({
      ...manifest,
      theme: { source: context.surfaceId ?? "default" },
    }),
  };
  const cache: ManifestCache = {
    get: async (key) => {
      const encoded = JSON.stringify(key);
      keys.push(`get:${encoded}`);
      return values.get(encoded) ?? null;
    },
    set: async (key, value) => {
      const encoded = JSON.stringify(key);
      keys.push(`set:${encoded}`);
      values.set(encoded, value);
    },
    delete: async (key) => {
      values.delete(JSON.stringify(key));
    },
    assertReady: async () => undefined,
  };
  const hostResolver: SiteHostResolver = {
    resolve: async () => ({
      siteId: "site-a",
      key: "main",
      canonicalHost: "app.example",
      defaultLocale: "en-US",
      timezone: "UTC",
      generation: "1",
    }),
  };
  const service = new RuntimeManifestService(repository, cache, hostResolver);
  const context = {
    tenantId: "tenant-a",
    actorId: null,
    organizationId: null,
    surfaceId: "surface-a",
    permissions: [],
    correlationId: "request-a",
  } as const;

  await expect(
    service.get({
      context,
      productId: "product-a",
      locale: "en-US",
      host: "app.example",
    }),
  ).resolves.toMatchObject({ theme: { source: "surface-a" } });
  await expect(
    service.get({
      context: { ...context, surfaceId: null },
      productId: "product-a",
      locale: "en-US",
      host: "app.example",
    }),
  ).resolves.toMatchObject({ theme: { source: "default" } });
  expect(keys).toHaveLength(4);
  expect(keys[0]).toContain('"surfaceId":"surface-a"');
  expect(keys[1]).toContain('"surfaceId":"surface-a"');
  expect(keys[2]).toContain('"surfaceId":null');
  expect(keys[3]).toContain('"surfaceId":null');
});

describe("release cache visibility", () => {
  const publishingContext = {
    tenantId: "tenant-a",
    actorId: "actor-a",
    organizationId: null,
    surfaceId: null,
    permissions: ["system:read", "system:write", "system:publish"],
    correlationId: "request-a",
  } as const;

  it("invalidates all manifests for the tenant when publish or retire changes release visibility", async () => {
    const invalidatedTenants: string[] = [];
    const service = new SystemControlService(
      new InMemorySystemControlRepository(),
      {
        invalidateTenant: async (tenantId: string) => {
          invalidatedTenants.push(tenantId);
        },
      },
    );
    const release = await service.createRelease(
      publishingContext,
      { releaseKey: "r1", digest: "a".repeat(64) },
      "create-release",
    );

    await service.validateRelease(
      publishingContext,
      release.id,
      "validate-release",
    );
    await service.publishRelease(
      publishingContext,
      release.id,
      "publish-release",
    );
    await service.retireRelease(
      publishingContext,
      release.id,
      "retire-release",
    );

    expect(invalidatedTenants).toEqual(["tenant-a", "tenant-a"]);
  });

  it("retries post-commit invalidation when a published release command is replayed", async () => {
    let attempts = 0;
    const service = new SystemControlService(
      new InMemorySystemControlRepository(),
      {
        invalidateTenant: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("cache unavailable");
        },
      },
    );
    const release = await service.createRelease(
      publishingContext,
      { releaseKey: "r1", digest: "a".repeat(64) },
      "create-release",
    );
    await service.validateRelease(
      publishingContext,
      release.id,
      "validate-release",
    );

    await expect(
      service.publishRelease(
        publishingContext,
        release.id,
        "publish-release",
      ),
    ).rejects.toThrow("cache unavailable");
    await expect(
      service.publishRelease(
        publishingContext,
        release.id,
        "publish-release",
      ),
    ).resolves.toMatchObject({ status: "published" });
    expect(attempts).toBe(2);
  });
});

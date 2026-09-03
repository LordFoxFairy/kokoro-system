import { describe, expect, it } from "vitest";
import { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
import type {
  ManifestCache,
  SiteHostResolver,
  SystemRepository,
} from "../src/application/runtime-manifest/ports/index.js";
import type { RuntimeManifest } from "../src/domain/runtime-manifest/models/index.js";
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
        generation: 1,
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
    getManifest: async ({ context }) => ({
      ...manifest,
      theme: { source: context.surfaceId ?? "default" },
    }),
  };
  const cache: ManifestCache = {
    get: async (key) => {
      keys.push(`get:${key}`);
      return values.get(key) ?? null;
    },
    set: async (key, value) => {
      keys.push(`set:${key}`);
      values.set(key, value);
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
      generation: 1,
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
  expect(keys).toEqual([
    "get:manifest:tenant-a:product-a:en-US:surface-a",
    "set:manifest:tenant-a:product-a:en-US:surface-a",
    "get:manifest:tenant-a:product-a:en-US:default",
    "set:manifest:tenant-a:product-a:en-US:default",
  ]);
});

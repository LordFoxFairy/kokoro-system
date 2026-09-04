import { describe, expect, it } from "vitest";

import type {
  ManifestCache,
  ManifestCacheIdentity,
  SiteHostResolver,
  SystemRepository,
} from "../src/application/runtime-manifest/ports/index.js";
import { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
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
  digest: "base",
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

const context = {
  tenantId: "tenant-a",
  actorId: null,
  organizationId: null,
  surfaceId: null,
  permissions: [],
  correlationId: "request-a",
} as const;

function deferred(): Readonly<{ promise: Promise<void>; resolve(): void }> {
  let resolver: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return {
    promise,
    resolve: () => {
      if (resolver === undefined) throw new Error("deferred is not initialized");
      resolver();
    },
  };
}

function key(identity: ManifestCacheIdentity): string {
  return JSON.stringify(identity);
}

function request(service: RuntimeManifestService): Promise<RuntimeManifest> {
  return service.get({
    context,
    productId: "product-a",
    locale: "en-US",
    host: "app.example",
  });
}

describe("runtime manifest generation fence", () => {
  it("skips an old manifest fill after publication advances the generation", async () => {
    let generation = "1";
    let reads = 0;
    const readStarted = deferred();
    const continueRead = deferred();
    const oldManifest = {
      ...manifest,
      releaseId: "release-old",
      digest: "old",
    };
    const currentManifest = {
      ...manifest,
      releaseId: "release-new",
      digest: "new",
    };
    const repository: SystemRepository = {
      getManifestGeneration: async () => generation,
      getManifest: async () => {
        reads += 1;
        if (reads === 1) {
          readStarted.resolve();
          await continueRead.promise;
          return oldManifest;
        }
        return currentManifest;
      },
    };
    const values = new Map<string, RuntimeManifest>();
    const writes: string[] = [];
    const cache: ManifestCache = {
      get: async (identity) => values.get(key(identity)) ?? null,
      set: async (identity, value) => {
        const cacheKey = key(identity);
        writes.push(cacheKey);
        values.set(cacheKey, value);
      },
      delete: async (identity) => {
        values.delete(key(identity));
      },
      assertReady: async () => undefined,
    };
    const service = new RuntimeManifestService(repository, cache, hostResolver);

    const pending = request(service);
    await readStarted.promise;
    generation = "2";
    continueRead.resolve();

    await expect(pending).resolves.toEqual(currentManifest);
    expect(reads).toBe(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"generation":"2"');
    expect(
      [...values.entries()].some(
        ([identity, value]) =>
          identity.includes('"generation":"1"') && value.digest === "old",
      ),
    ).toBe(false);
  });

  it("deletes a stale fill when generation changes during the Redis write", async () => {
    let generation = "1";
    let reads = 0;
    const deleted: string[] = [];
    const repository: SystemRepository = {
      getManifestGeneration: async () => generation,
      getManifest: async () => {
        reads += 1;
        return {
          ...manifest,
          digest: reads === 1 ? "old" : "current",
        };
      },
    };
    const values = new Map<string, RuntimeManifest>();
    const cache: ManifestCache = {
      get: async (identity) => values.get(key(identity)) ?? null,
      set: async (identity, value) => {
        values.set(key(identity), value);
        if (identity.generation === "1") generation = "2";
      },
      delete: async (identity) => {
        const cacheKey = key(identity);
        deleted.push(cacheKey);
        values.delete(cacheKey);
      },
      assertReady: async () => undefined,
    };

    await expect(
      request(new RuntimeManifestService(repository, cache, hostResolver)),
    ).resolves.toMatchObject({ digest: "current" });
    expect(reads).toBe(2);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain('"generation":"1"');
    expect(
      [...values.keys()].some((identity) =>
        identity.includes('"generation":"1"'),
      ),
    ).toBe(false);
  });

  it("ignores stale facts after restarting with an old cache namespace", async () => {
    let reads = 0;
    const staleManifest = {
      ...manifest,
      releaseId: "release-retired",
      digest: "stale",
    };
    const currentManifest = { ...manifest, digest: "current" };
    const staleIdentity: ManifestCacheIdentity = {
      tenantId: "tenant-a",
      productId: "product-a",
      locale: "en-US",
      surfaceId: null,
      generation: "7",
    };
    const values = new Map<string, RuntimeManifest>([
      [key(staleIdentity), staleManifest],
    ]);
    const readsFromCache: string[] = [];
    const repository: SystemRepository = {
      getManifestGeneration: async () => "8",
      getManifest: async () => {
        reads += 1;
        return currentManifest;
      },
    };
    const cache: ManifestCache = {
      get: async (identity) => {
        const cacheKey = key(identity);
        readsFromCache.push(cacheKey);
        return values.get(cacheKey) ?? null;
      },
      set: async (identity, value) => {
        values.set(key(identity), value);
      },
      delete: async (identity) => {
        values.delete(key(identity));
      },
      assertReady: async () => undefined,
    };

    await expect(
      request(new RuntimeManifestService(repository, cache, hostResolver)),
    ).resolves.toEqual(currentManifest);
    expect(reads).toBe(1);
    expect(readsFromCache).toHaveLength(1);
    expect(readsFromCache[0]).toContain('"generation":"8"');
    expect(values.get(key(staleIdentity))).toEqual(staleManifest);
  });
});

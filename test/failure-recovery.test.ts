import { describe, expect, it } from "vitest";
import { RuntimeManifestService } from "../src/application/runtime-manifest/services/runtime-manifest.service.js";
import type {
  ManifestCache,
  SystemRepository,
  SiteHostResolver,
} from "../src/application/runtime-manifest/ports/index.js";
import type { RuntimeManifest } from "../src/domain/runtime-manifest/models/index.js";

const value: RuntimeManifest = {
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
const context = {
  tenantId: "tenant-a",
  actorId: null,
  organizationId: null,
  surfaceId: null,
  permissions: [],
  correlationId: "request-a",
} as const;
const siteResolution = {
  siteId: "site-a",
  key: "main",
  canonicalHost: "a.example.test",
  defaultLocale: "en-US",
  timezone: "UTC",
  generation: "1",
} as const;

describe("dependency failure and recovery fixtures", () => {
  it("fails closed on Redis outage and serves after Redis recovery", async () => {
    let redisReady = false;
    const cache: ManifestCache = {
      assertReady: async () => {
        if (!redisReady) throw new Error("redis down");
      },
      get: async () => {
        if (!redisReady) throw new Error("redis down");
        return null;
      },
      set: async () => {
        if (!redisReady) throw new Error("redis down");
      },
      delete: async () => {
        if (!redisReady) throw new Error("redis down");
      },
    };
    const repository: SystemRepository = {
      getManifestGeneration: async () => "0",
      getManifest: async () => value,
    };
    const service = new RuntimeManifestService(repository, cache, {
      resolve: async () => siteResolution,
    } satisfies SiteHostResolver);
    await expect(
      service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "a.example.test",
      }),
    ).rejects.toThrow("redis down");
    redisReady = true;
    await expect(
      service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "a.example.test",
      }),
    ).resolves.toEqual(value);
  });

  it("recovers after a PostgreSQL repository error without using an in-process fallback", async () => {
    let postgresReady = false;
    const repository: SystemRepository = {
      getManifestGeneration: async () => {
        if (!postgresReady) throw new Error("postgres down");
        return "0";
      },
      getManifest: async () => {
        if (!postgresReady) throw new Error("postgres down");
        return value;
      },
    };
    const cache: ManifestCache = {
      assertReady: async () => undefined,
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
    };
    const service = new RuntimeManifestService(repository, cache, {
      resolve: async () => siteResolution,
    } satisfies SiteHostResolver);
    await expect(
      service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "a.example.test",
      }),
    ).rejects.toThrow("postgres down");
    postgresReady = true;
    await expect(
      service.get({
        context,
        productId: "product-a",
        locale: "en-US",
        host: "a.example.test",
      }),
    ).resolves.toEqual(value);
  });
});

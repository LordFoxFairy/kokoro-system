import { describe, expect, it } from "vitest";
import {
  runtimeManifestCacheKey,
  runtimeManifestTenantPattern,
} from "../src/infrastructure/redis/runtime-manifest-cache-key.js";

const baseIdentity = {
  productId: "product:admin",
  locale: "en:US",
  generation: "9007199254740993",
} as const;

describe("runtime manifest Redis key encoding", () => {
  it("does not let a colon-bearing tenant share another tenant prefix", () => {
    const namespace = "kokoro:system:test";
    const tenant = runtimeManifestCacheKey(namespace, {
      ...baseIdentity,
      tenantId: "tenant",
      surfaceId: null,
    });
    const colonTenant = runtimeManifestCacheKey(namespace, {
      ...baseIdentity,
      tenantId: "tenant:child",
      surfaceId: null,
    });

    expect(colonTenant).not.toBe(tenant);
    expect(
      tenant.startsWith(
        runtimeManifestTenantPattern(namespace, "tenant").slice(0, -1),
      ),
    ).toBe(true);
    expect(
      colonTenant.startsWith(
        runtimeManifestTenantPattern(namespace, "tenant").slice(0, -1),
      ),
    ).toBe(false);
  });

  it("distinguishes a null surface from the literal default surface", () => {
    const namespace = "kokoro:system:test";
    expect(
      runtimeManifestCacheKey(namespace, {
        ...baseIdentity,
        tenantId: "tenant",
        surfaceId: null,
      }),
    ).not.toBe(
      runtimeManifestCacheKey(namespace, {
        ...baseIdentity,
        tenantId: "tenant",
        surfaceId: "default",
      }),
    );
  });
});

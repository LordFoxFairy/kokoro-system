import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  ManifestCache,
  ManifestCacheIdentity,
  SiteHostResolver,
} from "../../src/application/runtime-manifest/ports/index.js";
import { RuntimeManifestService } from "../../src/application/runtime-manifest/services/runtime-manifest.service.js";
import { SystemControlService } from "../../src/application/system/services/system-control.service.js";
import type { RuntimeManifest } from "../../src/domain/runtime-manifest/models/index.js";
import { runtimeManifestCacheKey } from "../../src/infrastructure/redis/runtime-manifest-cache-key.js";
import { PostgresSystemRepository } from "../../src/infrastructure/repositories/runtime-manifest/postgres-system.repository.js";
import { PostgresSystemControlRepository } from "../../src/infrastructure/repositories/system/system-control-repository.js";
import {
  createRealSystemFixture,
  type RealSystemFixture,
} from "./real-system-fixture.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL;
const real = databaseUrl !== undefined && redisUrl !== undefined;
const describeReal = real ? describe : describe.skip;

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

const hostResolver: SiteHostResolver = {
  resolve: async () => ({
    siteId: randomUUID(),
    key: "main",
    canonicalHost: "tenant.example.test",
    defaultLocale: "en-US",
    timezone: "UTC",
    generation: "1",
  }),
};

function context(tenantId: string) {
  return {
    tenantId,
    actorId: randomUUID(),
    organizationId: null,
    surfaceId: null,
    permissions: ["system:read", "system:write", "system:publish"],
    correlationId: randomUUID(),
  } as const;
}

async function seedPublishedManifest(
  fixture: RealSystemFixture,
  tenantId: string,
): Promise<Readonly<{ productId: string; productKey: string; releaseId: string }>> {
  const productId = randomUUID();
  const productKey = `product-${randomUUID()}`;
  const releaseId = randomUUID();
  const now = new Date();
  await fixture.query(
    "INSERT INTO system_product (id, product_key, name, status, created_at, updated_at) VALUES ($1, $2, 'Product', 'active', $3, $4)",
    [productId, productKey, now, now],
  );
  await fixture.query(
    "INSERT INTO system_config_release (id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at) VALUES ($1, $2, $3, 'published', $4, $5, 1, $6, $7)",
    [releaseId, tenantId, `release-${randomUUID()}`, "a".repeat(64), now, now, now],
  );
  await fixture.query(
    "INSERT INTO system_release_binding (id, scope_type, scope_id, product_id, release_id, status, created_at, updated_at) VALUES ($1, 'tenant', $2, $3, $4, 'active', $5, $6)",
    [randomUUID(), tenantId, productId, releaseId, now, now],
  );
  for (const [id, release, source, version] of [
    [randomUUID(), null, "base", "1"],
    [randomUUID(), releaseId, "published", "2"],
  ] as const)
    await fixture.query(
      "INSERT INTO system_config_record (id, tenant_id, module_key, scope_type, scope_id, product_id, locale, config_key, schema_version, value_json, status, config_version, release_id, digest, created_at, updated_at) VALUES ($1, $2, 'theme', 'tenant', $3, $4, 'en-US', 'default', 1, $5, 'active', $6, $7, $8, $9, $10)",
      [
        id,
        tenantId,
        tenantId,
        productId,
        JSON.stringify({ source }),
        version,
        release,
        "b".repeat(64),
        now,
        now,
      ],
    );
  return { productId, productKey, releaseId };
}

function source(manifest: RuntimeManifest): unknown {
  return manifest.theme.source;
}

describeReal("real PostgreSQL/Redis runtime manifest consistency", () => {
  let fixture: RealSystemFixture;

  beforeAll(async () => {
    if (databaseUrl === undefined || redisUrl === undefined)
      throw new Error("real integration URLs are required");
    fixture = await createRealSystemFixture(databaseUrl, redisUrl);
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("removes a real Redis fill written after retire cleanup and before the post-write fence", async () => {
    const tenantId = `tenant:race:${randomUUID()}`;
    const seeded = await seedPublishedManifest(fixture, tenantId);
    const postgres = new PostgresSystemRepository(fixture.pool);
    const beforeFirstSet = deferred();
    const allowFirstSet = deferred();
    const firstSetCompleted = deferred();
    const allowPostWriteFence = deferred();
    const redis = fixture.cache("race");
    let setCount = 0;
    const cache: ManifestCache = {
      assertReady: () => redis.assertReady(),
      get: (identity) => redis.get(identity),
      set: async (identity, value, ttlSeconds) => {
        setCount += 1;
        if (setCount === 1) {
          beforeFirstSet.resolve();
          await allowFirstSet.promise;
          await redis.set(identity, value, ttlSeconds);
          firstSetCompleted.resolve();
          await allowPostWriteFence.promise;
          return;
        }
        await redis.set(identity, value, ttlSeconds);
      },
      delete: (identity) => redis.delete(identity),
    };
    const service = new RuntimeManifestService(postgres, cache, hostResolver);
    const requestContext = context(tenantId);
    const pending = service.get({
      context: requestContext,
      productId: seeded.productKey,
      locale: "en-US",
      host: "tenant.example.test",
    });
    await beforeFirstSet.promise;
    const control = new SystemControlService(
      new PostgresSystemControlRepository(fixture.pool),
      redis,
    );
    await control.retireRelease(requestContext, seeded.releaseId, randomUUID());
    allowFirstSet.resolve();
    await firstSetCompleted.promise;

    const staleIdentity: ManifestCacheIdentity = {
      tenantId,
      productId: seeded.productKey,
      locale: "en-US",
      surfaceId: null,
      generation: "0",
    };
    expect(
      await fixture.redis.exists(
        runtimeManifestCacheKey(fixture.namespace("race"), staleIdentity),
      ),
    ).toBe(1);
    allowPostWriteFence.resolve();

    const result = await pending;
    expect(result.releaseId).toBeNull();
    expect(source(result)).toBe("base");
    expect(setCount).toBe(2);
    expect(
      await fixture.redis.exists(
        runtimeManifestCacheKey(fixture.namespace("race"), staleIdentity),
      ),
    ).toBe(0);
  });

  it("ignores stale facts in a previous deployment namespace after restart", async () => {
    const tenantId = `tenant:restart:${randomUUID()}`;
    const seeded = await seedPublishedManifest(fixture, tenantId);
    const postgres = new PostgresSystemRepository(fixture.pool);
    const oldCache = fixture.cache("deployment-old");
    const before = await new RuntimeManifestService(
      postgres,
      oldCache,
      hostResolver,
    ).get({
      context: context(tenantId),
      productId: seeded.productKey,
      locale: "en-US",
      host: "tenant.example.test",
    });
    expect(before.releaseId).toBe(seeded.releaseId);

    const newCache = fixture.cache("deployment-new");
    await new SystemControlService(
      new PostgresSystemControlRepository(fixture.pool),
      newCache,
    ).retireRelease(context(tenantId), seeded.releaseId, randomUUID());
    const oldIdentity: ManifestCacheIdentity = {
      tenantId,
      productId: seeded.productKey,
      locale: "en-US",
      surfaceId: null,
      generation: "0",
    };
    expect(
      await fixture.redis.exists(
        runtimeManifestCacheKey(
          fixture.namespace("deployment-old"),
          oldIdentity,
        ),
      ),
    ).toBe(1);
    await oldCache.close();

    const restartedOldCache = fixture.cache("deployment-old");
    const after = await new RuntimeManifestService(
      postgres,
      restartedOldCache,
      hostResolver,
    ).get({
      context: context(tenantId),
      productId: seeded.productKey,
      locale: "en-US",
      host: "tenant.example.test",
    });
    expect(after.releaseId).toBeNull();
    expect(source(after)).toBe("base");
  });

  it("invalidates an encoded tenant without colliding with colon or surface values", async () => {
    const cache = fixture.cache("encoding");
    const identity = (
      tenantId: string,
      surfaceId: string | null,
    ): ManifestCacheIdentity => ({
      tenantId,
      productId: "product:admin",
      locale: "en:US",
      surfaceId,
      generation: "1",
    });
    const value = (tenantId: string, digest: string): RuntimeManifest => ({
      tenantId,
      productId: "product:admin",
      locale: "en:US",
      navigation: [],
      localeNamespaces: [],
      theme: {},
      featureFlags: [],
      references: [],
      configVersion: "1",
      releaseId: null,
      digest,
    });
    await cache.set(identity("tenant", null), value("tenant", "null"), 30);
    await cache.set(
      identity("tenant", "default"),
      value("tenant", "literal-default"),
      30,
    );
    await cache.set(
      identity("tenant:child", null),
      value("tenant:child", "child"),
      30,
    );
    await expect(cache.get(identity("tenant", null))).resolves.toMatchObject({
      digest: "null",
    });
    await expect(
      cache.get(identity("tenant", "default")),
    ).resolves.toMatchObject({ digest: "literal-default" });

    await cache.invalidateTenant("tenant");

    await expect(cache.get(identity("tenant", null))).resolves.toBeNull();
    await expect(
      cache.get(identity("tenant", "default")),
    ).resolves.toBeNull();
    await expect(
      cache.get(identity("tenant:child", null)),
    ).resolves.toMatchObject({ digest: "child" });
  });
});

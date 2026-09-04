import { createClient, type RedisClientType } from "redis";
import type {
  ManifestCache,
  ManifestCacheIdentity,
} from "../../application/runtime-manifest/ports/index.js";
import type { RuntimeManifestCacheInvalidator } from "../../application/system/ports/runtime-manifest-cache-invalidator.js";
import type { RuntimeManifest } from "../../domain/runtime-manifest/models/index.js";
import { decodeRuntimeManifestCache } from "./runtime-manifest-cache-decoder.js";
import {
  runtimeManifestCacheKey,
  runtimeManifestTenantPattern,
  runtimeManifestTenantPrefix,
} from "./runtime-manifest-cache-key.js";
export class RedisCoordinator
  implements ManifestCache, RuntimeManifestCacheInvalidator
{
  private readonly client: RedisClientType;
  private open = false;
  public constructor(
    url: string,
    private readonly namespace = "kokoro:system",
  ) {
    this.client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) =>
          retries >= 3
            ? new Error("Redis unavailable")
            : Math.min(100 * (retries + 1), 500),
      },
    });
    this.client.on("error", () => undefined);
  }
  public async connect(): Promise<void> {
    if (!this.open) {
      await this.client.connect();
      this.open = true;
    }
  }
  public async assertReady(): Promise<void> {
    await this.connect();
    if ((await this.client.ping()) !== "PONG")
      throw new Error("Redis is not ready");
  }
  public async get(
    identity: ManifestCacheIdentity,
  ): Promise<RuntimeManifest | null> {
    await this.assertReady();
    const value = await this.client.get(
      runtimeManifestCacheKey(this.namespace, identity),
    );
    return value === null ? null : decodeRuntimeManifestCache(value);
  }
  public async set(
    identity: ManifestCacheIdentity,
    value: RuntimeManifest,
    ttlSeconds: number,
  ): Promise<void> {
    await this.assertReady();
    await this.client.set(
      runtimeManifestCacheKey(this.namespace, identity),
      JSON.stringify(value),
      { EX: ttlSeconds },
    );
  }
  public async delete(identity: ManifestCacheIdentity): Promise<void> {
    await this.assertReady();
    await this.client.del(runtimeManifestCacheKey(this.namespace, identity));
  }
  public async invalidateTenant(tenantId: string): Promise<void> {
    await this.assertReady();
    const tenantPrefix = runtimeManifestTenantPrefix(this.namespace, tenantId);
    for await (const keys of this.client.scanIterator({
      MATCH: runtimeManifestTenantPattern(this.namespace, tenantId),
      COUNT: 100,
    })) {
      const tenantKeys = keys.filter((key) => key.startsWith(tenantPrefix));
      if (tenantKeys.length > 0) await this.client.del(tenantKeys);
    }
  }
  public async close(): Promise<void> {
    if (this.open) await this.client.quit();
    this.open = false;
  }
}

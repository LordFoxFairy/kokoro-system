import { createClient, type RedisClientType } from "redis";
import type { ManifestCache } from "../../modules/runtime-manifest/ports.js";
import type { RuntimeManifest } from "../../modules/runtime-manifest/model.js";
export class RedisCoordinator implements ManifestCache {
  private readonly client: RedisClientType;
  private open = false;
  public constructor(private readonly url: string, private readonly namespace = "kokoro:system") { this.client = createClient({ url }); this.client.on("error", () => undefined); }
  public async connect(): Promise<void> { if (!this.open) { await this.client.connect(); this.open = true; } }
  public async assertReady(): Promise<void> { await this.connect(); if (await this.client.ping() !== "PONG") throw new Error("Redis is not ready"); }
  private key(key: string): string { return `${this.namespace}:${key}`; }
  public async get(key: string): Promise<RuntimeManifest | null> { await this.assertReady(); const value = await this.client.get(this.key(key)); return value === null ? null : JSON.parse(value) as RuntimeManifest; }
  public async set(key: string, value: RuntimeManifest, ttlSeconds: number): Promise<void> { await this.assertReady(); await this.client.set(this.key(key), JSON.stringify(value), { EX: ttlSeconds }); }
  public async close(): Promise<void> { if (this.open) await this.client.quit(); this.open = false; }
}

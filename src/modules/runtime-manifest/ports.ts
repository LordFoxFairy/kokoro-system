import type { RuntimeManifest, TenantRequestContext } from "./model.js";
export interface SystemRepository {
  getManifest(input: Readonly<{ context: TenantRequestContext; productId: string; locale: string }>): Promise<RuntimeManifest>;
}
export interface SiteHostResolver {
  verify(input: Readonly<{ context: TenantRequestContext; host: string }>): Promise<void>;
}
export interface ManifestCache {
  get(key: string): Promise<RuntimeManifest | null>;
  set(key: string, value: RuntimeManifest, ttlSeconds: number): Promise<void>;
  assertReady(): Promise<void>;
}

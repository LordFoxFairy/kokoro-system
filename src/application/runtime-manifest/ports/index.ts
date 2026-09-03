import type {
  RuntimeManifest,
  TenantRequestContext,
} from "../../../domain/runtime-manifest/models/index.js";
import type { SiteResolution } from "../../../domain/system/models/index.js";
export interface SystemRepository {
  getManifest(
    input: Readonly<{
      context: TenantRequestContext;
      productId: string;
      locale: string;
    }>,
  ): Promise<RuntimeManifest>;
}
export interface SiteHostResolver {
  resolve(
    input: Readonly<{ context: TenantRequestContext; host: string }>,
  ): Promise<SiteResolution>;
}
export interface ManifestCache {
  get(key: string): Promise<RuntimeManifest | null>;
  set(key: string, value: RuntimeManifest, ttlSeconds: number): Promise<void>;
  assertReady(): Promise<void>;
}

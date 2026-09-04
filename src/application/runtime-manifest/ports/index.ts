import type {
  RuntimeManifest,
  TenantRequestContext,
} from "../../../domain/runtime-manifest/models/index.js";
import type { SiteResolution } from "../../../domain/system/models/index.js";

export type ManifestCacheIdentity = Readonly<{
  tenantId: string;
  productId: string;
  locale: string;
  surfaceId: string | null;
  generation: string;
}>;

export interface SystemRepository {
  getManifestGeneration(tenantId: string): Promise<string>;
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
  get(identity: ManifestCacheIdentity): Promise<RuntimeManifest | null>;
  set(
    identity: ManifestCacheIdentity,
    value: RuntimeManifest,
    ttlSeconds: number,
  ): Promise<void>;
  delete(identity: ManifestCacheIdentity): Promise<void>;
  assertReady(): Promise<void>;
}

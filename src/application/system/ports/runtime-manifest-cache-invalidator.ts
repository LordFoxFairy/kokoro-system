export interface RuntimeManifestCacheInvalidator {
  invalidateTenant(tenantId: string): Promise<void>;
}

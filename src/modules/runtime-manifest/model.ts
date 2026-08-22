export type ScopeType = "global" | "tenant" | "product" | "surface";
export type TenantRequestContext = Readonly<{ tenantId: string; actorId: string | null; organizationId: string | null; surfaceId: string | null; permissions: readonly string[]; correlationId: string }>;
export type RuntimeManifest = Readonly<{
  tenantId: string; productId: string; locale: string;
  navigation: readonly unknown[]; localeNamespaces: readonly unknown[]; theme: Readonly<Record<string, unknown>>;
  featureFlags: readonly unknown[]; references: readonly unknown[];
  configVersion: string; releaseId: string | null; digest: string;
}>;
export type ConfigRecord = Readonly<{
  id: string; tenantId: string | null; moduleKey: string; scopeType: ScopeType; scopeId: string | null; productId: string | null; locale: string | null;
  configKey: string; schemaVersion: number; value: unknown; status: "active" | "deleted";
  configVersion: bigint; releaseId: string | null; digest: string;
}>;

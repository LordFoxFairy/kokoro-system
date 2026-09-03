export type RuntimeManifest = Readonly<{
  tenantId: string;
  productId: string;
  locale: string;
  navigation: readonly unknown[];
  localeNamespaces: readonly unknown[];
  theme: Readonly<Record<string, unknown>>;
  featureFlags: readonly unknown[];
  references: readonly unknown[];
  configVersion: string;
  releaseId: string | null;
  digest: string;
}>;

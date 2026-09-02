import type { ConfigScopeType, ConfigStatus, ReleaseStatus, SitePolicyStatus, SiteStatus, WorkspaceStatus } from "./enums.js";

export type Site = Readonly<{
  id: string;
  tenantId: string;
  siteKey: string;
  hostnames: readonly string[];
  displayName: string;
  status: SiteStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type Workspace = Readonly<{
  id: string;
  tenantId: string;
  siteId: string;
  workspaceKey: string;
  name: string;
  status: WorkspaceStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

export type SitePolicy = Readonly<{
  id: string;
  tenantId: string;
  siteId: string;
  version: number;
  status: SitePolicyStatus;
  defaultLocale: string;
  allowedLocales: readonly string[];
  allowedProducts: readonly string[];
  publicManifest: boolean;
  updatedAt: string;
}>;

export type SystemConfig = Readonly<{
  id: string;
  tenantId: string | null;
  moduleKey: string;
  configKey: string;
  scopeType: ConfigScopeType;
  scopeId: string | null;
  productId: string | null;
  locale: string | null;
  value: unknown;
  schemaVersion: number;
  status: ConfigStatus;
  configVersion: number;
  releaseId: string | null;
  digest: string;
  updatedAt: string;
}>;

export type ConfigRelease = Readonly<{
  id: string;
  tenantId: string;
  releaseKey: string;
  status: ReleaseStatus;
  digest: string;
  publishedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

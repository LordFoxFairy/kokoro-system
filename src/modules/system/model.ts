import type { TenantRequestContext } from "../runtime-manifest/model.js";

export type SiteStatus = "draft" | "active" | "suspended" | "archived";
export type WorkspaceStatus = "active" | "archived";
export type ConfigStatus = "active" | "deleted";
export type ReleaseStatus = "draft" | "validated" | "published" | "retired";

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
  status: "active" | "archived";
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
  scopeType: "global" | "tenant" | "product" | "surface";
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

export type PageRequest = Readonly<{ cursor?: string; limit?: number }>;
export type Page<T> = Readonly<{ items: readonly T[]; nextCursor: string | null }>;
export type SiteInput = Readonly<{ siteKey: string; hostname: string; displayName: string }>;
export type WorkspaceInput = Readonly<{ siteId: string; workspaceKey: string; name: string }>;
export type ReleaseInput = Readonly<{ releaseKey: string; digest: string }>;
export type ConfigInput = Readonly<{ moduleKey: string; configKey: string; scopeType: "global" | "tenant" | "product" | "surface"; scopeId: string | null; productId: string | null; locale: string | null; value: unknown; schemaVersion: number; releaseId: string | null }>;

export type SystemControlRepository = {
  listSites(context: TenantRequestContext, page: PageRequest): Promise<Page<Site>>;
  createSite(context: TenantRequestContext, input: SiteInput): Promise<Site>;
  listWorkspaces(context: TenantRequestContext, page: PageRequest): Promise<Page<Workspace>>;
  createWorkspace(context: TenantRequestContext, input: WorkspaceInput): Promise<Workspace>;
  getPolicy(context: TenantRequestContext, siteId: string): Promise<SitePolicy | null>;
  putPolicy(context: TenantRequestContext, siteId: string, input: Omit<SitePolicy, "id" | "tenantId" | "siteId" | "updatedAt">): Promise<SitePolicy>;
  createRelease(context: TenantRequestContext, input: ReleaseInput): Promise<ConfigRelease>;
  listConfigs(context: TenantRequestContext, page: PageRequest): Promise<Page<SystemConfig>>;
  upsertConfig(context: TenantRequestContext, input: ConfigInput): Promise<SystemConfig>;
  getRelease(context: TenantRequestContext, releaseId: string): Promise<ConfigRelease | null>;
  updateRelease(context: TenantRequestContext, releaseId: string, status: ReleaseStatus): Promise<ConfigRelease>;
  getReceipt(tenantId: string, key: string): Promise<Readonly<{ requestHash: string; response: unknown }> | null>;
  saveReceipt(tenantId: string, key: string, requestHash: string, response: unknown): Promise<void>;
};

export type Permission = "system:read" | "system:write" | "system:publish";

import type { TenantRequestContext } from "../../runtime-manifest/model.js";
import type { ConfigRelease, Site, SitePolicy, SystemConfig, Workspace } from "../domain/models.js";
import type { ConfigInput, Page, PageRequest, ReleaseInput, SiteInput, WorkspaceInput } from "./dto.js";
import type { ReleaseStatus } from "../domain/enums.js";

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

export type SystemPermission = "system:read" | "system:write" | "system:publish";

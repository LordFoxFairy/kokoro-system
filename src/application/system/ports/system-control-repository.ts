import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type {
  ConfigRelease,
  Site,
  SitePolicy,
  SystemConfig,
  Workspace,
} from "../../../domain/system/models/index.js";
import type {
  ConfigInput,
  Page,
  PageRequest,
  ReleaseInput,
  SiteInput,
  SitePolicyInput,
  WorkspaceInput,
} from "../dto/index.js";
import type { ReleaseStatus } from "../../../domain/system/enums/index.js";

export type SystemControlDataRepository = {
  listSites(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Site>>;
  createSite(context: TenantRequestContext, input: SiteInput): Promise<Site>;
  listWorkspaces(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Workspace>>;
  createWorkspace(
    context: TenantRequestContext,
    input: WorkspaceInput,
  ): Promise<Workspace>;
  getPolicy(
    context: TenantRequestContext,
    siteId: string,
  ): Promise<SitePolicy | null>;
  putPolicy(
    context: TenantRequestContext,
    siteId: string,
    input: SitePolicyInput,
  ): Promise<SitePolicy>;
  createRelease(
    context: TenantRequestContext,
    input: ReleaseInput,
  ): Promise<ConfigRelease>;
  listConfigs(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<SystemConfig>>;
  upsertConfig(
    context: TenantRequestContext,
    input: ConfigInput,
  ): Promise<SystemConfig>;
  getRelease(
    context: TenantRequestContext,
    releaseId: string,
  ): Promise<ConfigRelease | null>;
  updateRelease(
    context: TenantRequestContext,
    releaseId: string,
    status: ReleaseStatus,
    expectedVersion: string,
  ): Promise<ConfigRelease>;
};

export type IdempotentExecution<T> =
  | Readonly<{ kind: "executed"; value: T }>
  | Readonly<{ kind: "replayed"; value: unknown }>;

export type SystemControlRepository = SystemControlDataRepository & {
  executeIdempotent<T>(
    tenantId: string,
    key: string,
    requestHash: string,
    operation: (repository: SystemControlDataRepository) => Promise<T>,
  ): Promise<IdempotentExecution<T>>;
};

export type SystemPermission =
  | "system:read"
  | "system:write"
  | "system:publish";

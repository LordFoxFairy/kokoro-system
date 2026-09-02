import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { ConfigInput, Page, PageRequest, ReleaseInput, SiteInput, WorkspaceInput } from "../../../modules/system/application/dto.js";
import type { ConfigRelease as Release, Site as SiteModel, SitePolicy as PolicyModel, SystemConfig as ConfigModel, Workspace as WorkspaceModel } from "../../../modules/system/domain/models.js";
import type { SystemControlRepository } from "../../../modules/system/application/ports.js";
import type { SqlPool } from "../client.js";
import { PostgresConfigRepository } from "./config-repository.js";
import { PostgresPolicyRepository } from "./policy-repository.js";
import { PostgresReceiptRepository } from "./receipt-repository.js";
import { PostgresReleaseRepository } from "./release-repository.js";
import { PostgresSiteRepository } from "./site-repository.js";
import { PostgresWorkspaceRepository } from "./workspace-repository.js";
import type { ReleaseStatus } from "../../../modules/system/domain/enums.js";

/** Persistence facade: each resource repository owns only its aggregate queries. */
export class PostgresSystemControlRepository implements SystemControlRepository {
  private readonly sites: PostgresSiteRepository;
  private readonly workspaces: PostgresWorkspaceRepository;
  private readonly policies: PostgresPolicyRepository;
  private readonly configs: PostgresConfigRepository;
  private readonly releases: PostgresReleaseRepository;
  private readonly receipts: PostgresReceiptRepository;
  public constructor(pool: SqlPool) { this.sites = new PostgresSiteRepository(pool); this.workspaces = new PostgresWorkspaceRepository(pool); this.policies = new PostgresPolicyRepository(pool); this.configs = new PostgresConfigRepository(pool); this.releases = new PostgresReleaseRepository(pool); this.receipts = new PostgresReceiptRepository(pool); }
  public listSites(context: TenantRequestContext, page: PageRequest): Promise<Page<SiteModel>> { return this.sites.list(context, page); }
  public createSite(context: TenantRequestContext, input: SiteInput): Promise<SiteModel> { return this.sites.create(context, input); }
  public listWorkspaces(context: TenantRequestContext, page: PageRequest): Promise<Page<WorkspaceModel>> { return this.workspaces.list(context, page); }
  public createWorkspace(context: TenantRequestContext, input: WorkspaceInput): Promise<WorkspaceModel> { return this.workspaces.create(context, input); }
  public getPolicy(context: TenantRequestContext, siteId: string): Promise<PolicyModel | null> { return this.policies.get(context, siteId); }
  public putPolicy(context: TenantRequestContext, siteId: string, input: Omit<PolicyModel, "id" | "tenantId" | "siteId" | "updatedAt">): Promise<PolicyModel> { return this.policies.put(context, siteId, input); }
  public createRelease(context: TenantRequestContext, input: ReleaseInput): Promise<Release> { return this.releases.create(context, input); }
  public listConfigs(context: TenantRequestContext, page: PageRequest): Promise<Page<ConfigModel>> { return this.configs.list(context, page); }
  public upsertConfig(context: TenantRequestContext, input: ConfigInput): Promise<ConfigModel> { return this.configs.upsert(context, input); }
  public getRelease(context: TenantRequestContext, releaseId: string): Promise<Release | null> { return this.releases.get(context, releaseId); }
  public updateRelease(context: TenantRequestContext, releaseId: string, status: ReleaseStatus): Promise<Release> { return this.releases.update(context, releaseId, status); }
  public getReceipt(tenantId: string, key: string): Promise<Readonly<{ requestHash: string; response: unknown }> | null> { return this.receipts.get(tenantId, key); }
  public saveReceipt(tenantId: string, key: string, requestHash: string, response: unknown): Promise<void> { return this.receipts.save(tenantId, key, requestHash, response); }
}

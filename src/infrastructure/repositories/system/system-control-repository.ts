import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type {
  ConfigInput,
  Page,
  PageRequest,
  ReleaseInput,
  SiteInput,
  WorkspaceInput,
} from "../../../application/system/dto/index.js";
import type {
  ConfigRelease,
  Site,
  SitePolicy,
  SystemConfig,
  Workspace,
} from "../../../domain/system/models/index.js";
import type {
  IdempotentExecution,
  SystemControlDataRepository,
  SystemControlRepository,
} from "../../../application/system/ports/system-control-repository.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import { PostgresConfigRepository } from "./config-repository.js";
import { PostgresPolicyRepository } from "./policy-repository.js";
import { PostgresReceiptRepository } from "./receipt-repository.js";
import { PostgresReleaseRepository } from "./release-repository.js";
import { PostgresSiteRepository } from "./site-repository.js";
import { PostgresWorkspaceRepository } from "./workspace-repository.js";
import type { ReleaseStatus } from "../../../domain/system/enums/index.js";
import { withTransaction } from "./support.js";

/** Persistence facade: each resource repository owns only its aggregate queries. */
class PostgresSystemControlDataRepository
  implements SystemControlDataRepository
{
  private readonly sites: PostgresSiteRepository;
  private readonly workspaces: PostgresWorkspaceRepository;
  private readonly policies: PostgresPolicyRepository;
  private readonly configs: PostgresConfigRepository;
  private readonly releases: PostgresReleaseRepository;
  public constructor(
    protected readonly pool: SqlPool,
    transactionClient: SqlClient | null = null,
  ) {
    this.sites = new PostgresSiteRepository(pool, transactionClient);
    this.workspaces = new PostgresWorkspaceRepository(pool, transactionClient);
    this.policies = new PostgresPolicyRepository(pool, transactionClient);
    this.configs = new PostgresConfigRepository(pool, transactionClient);
    this.releases = new PostgresReleaseRepository(pool, transactionClient);
  }
  public listSites(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Site>> {
    return this.sites.list(context, page);
  }
  public createSite(
    context: TenantRequestContext,
    input: SiteInput,
  ): Promise<Site> {
    return this.sites.create(context, input);
  }
  public listWorkspaces(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Workspace>> {
    return this.workspaces.list(context, page);
  }
  public createWorkspace(
    context: TenantRequestContext,
    input: WorkspaceInput,
  ): Promise<Workspace> {
    return this.workspaces.create(context, input);
  }
  public getPolicy(
    context: TenantRequestContext,
    siteId: string,
  ): Promise<SitePolicy | null> {
    return this.policies.get(context, siteId);
  }
  public putPolicy(
    context: TenantRequestContext,
    siteId: string,
    input: Omit<SitePolicy, "id" | "tenantId" | "siteId" | "updatedAt">,
  ): Promise<SitePolicy> {
    return this.policies.put(context, siteId, input);
  }
  public createRelease(
    context: TenantRequestContext,
    input: ReleaseInput,
  ): Promise<ConfigRelease> {
    return this.releases.create(context, input);
  }
  public listConfigs(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<SystemConfig>> {
    return this.configs.list(context, page);
  }
  public upsertConfig(
    context: TenantRequestContext,
    input: ConfigInput,
  ): Promise<SystemConfig> {
    return this.configs.upsert(context, input);
  }
  public getRelease(
    context: TenantRequestContext,
    releaseId: string,
  ): Promise<ConfigRelease | null> {
    return this.releases.get(context, releaseId);
  }
  public updateRelease(
    context: TenantRequestContext,
    releaseId: string,
    status: ReleaseStatus,
    expectedVersion: string,
  ): Promise<ConfigRelease> {
    return this.releases.update(context, releaseId, status, expectedVersion);
  }
}

/**
 * Owns the idempotency transaction: claim, digest comparison, domain mutation,
 * and durable response completion all use one PostgreSQL client and commit.
 */
export class PostgresSystemControlRepository
  extends PostgresSystemControlDataRepository
  implements SystemControlRepository
{
  public async executeIdempotent<T>(
    tenantId: string,
    key: string,
    requestHash: string,
    operation: (repository: SystemControlDataRepository) => Promise<T>,
  ): Promise<IdempotentExecution<T>> {
    return withTransaction(this.pool, async (client) => {
      const receipts = new PostgresReceiptRepository(this.pool, client);
      const claim = await receipts.claim(tenantId, key, requestHash);
      if (claim.kind === "completed")
        return { kind: "replayed", value: claim.response };
      const repository = new PostgresSystemControlDataRepository(
        this.pool,
        client,
      );
      const value = await operation(repository);
      await receipts.complete(tenantId, key, requestHash, value);
      return { kind: "executed", value };
    });
  }
}

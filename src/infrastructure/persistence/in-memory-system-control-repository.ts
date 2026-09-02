import { createHash, randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../modules/runtime-manifest/model.js";
import { SystemDomainError } from "../../modules/system/errors.js";
import type { ConfigInput, Page, PageRequest, ReleaseInput, SiteInput, WorkspaceInput } from "../../modules/system/application/dto.js";
import type { SystemControlRepository } from "../../modules/system/application/ports.js";
import type { ConfigRelease, Site, SitePolicy, SystemConfig, Workspace } from "../../modules/system/domain/models.js";

function now(): string { return new Date().toISOString(); }
function page<T extends { id: string }>(values: readonly T[], request: PageRequest): Page<T> {
  const limit = Math.min(Math.max(request.limit ?? 50, 1), 100);
  const start = request.cursor ? Number.parseInt(Buffer.from(request.cursor, "base64url").toString("utf8"), 10) : 0;
  if (!Number.isInteger(start) || start < 0) throw new SystemDomainError("INVALID_CURSOR", "cursor is invalid");
  const items = values.slice(start, start + limit);
  return { items, nextCursor: start + items.length < values.length ? Buffer.from(String(start + items.length)).toString("base64url") : null };
}
function tenant(context: TenantRequestContext): string { return context.tenantId; }

export class InMemorySystemControlRepository implements SystemControlRepository {
  private readonly sites: Site[] = [];
  private readonly workspaces: Workspace[] = [];
  private readonly policies = new Map<string, SitePolicy>();
  private readonly releases: ConfigRelease[] = [];
  private readonly configs: SystemConfig[] = [];
  private readonly receipts = new Map<string, Readonly<{ requestHash: string; response: unknown }>>();

  public async listSites(context: TenantRequestContext, request: PageRequest): Promise<Page<Site>> { return page(this.sites.filter((item) => item.tenantId === tenant(context) && item.status !== "archived"), request); }
  public async createSite(context: TenantRequestContext, input: SiteInput): Promise<Site> {
    if (this.sites.some((item) => item.tenantId === tenant(context) && item.siteKey === input.siteKey && item.status !== "archived")) throw new SystemDomainError("CONFLICT", "site_key already exists", 409);
    const timestamp = now(); const value: Site = { id: randomUUID(), tenantId: tenant(context), siteKey: input.siteKey, hostnames: [input.hostname], displayName: input.displayName, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp };
    this.sites.push(value); return value;
  }
  public async listWorkspaces(context: TenantRequestContext, request: PageRequest): Promise<Page<Workspace>> { return page(this.workspaces.filter((item) => item.tenantId === tenant(context) && item.status !== "archived"), request); }
  public async createWorkspace(context: TenantRequestContext, input: WorkspaceInput): Promise<Workspace> {
    const site = this.sites.find((item) => item.id === input.siteId && item.tenantId === tenant(context) && item.status !== "archived");
    if (!site) throw new SystemDomainError("NOT_FOUND", "site not found", 404);
    if (this.workspaces.some((item) => item.tenantId === tenant(context) && item.siteId === input.siteId && item.workspaceKey === input.workspaceKey && item.status !== "archived")) throw new SystemDomainError("CONFLICT", "workspace_key already exists", 409);
    const timestamp = now(); const value: Workspace = { id: randomUUID(), tenantId: tenant(context), siteId: site.id, workspaceKey: input.workspaceKey, name: input.name, status: "active", version: 1, createdAt: timestamp, updatedAt: timestamp };
    this.workspaces.push(value); return value;
  }
  public async getPolicy(context: TenantRequestContext, siteId: string): Promise<SitePolicy | null> { const value = this.policies.get(siteId); if (value === undefined || value.tenantId !== tenant(context)) return null; return value; }
  public async putPolicy(context: TenantRequestContext, siteId: string, input: Omit<SitePolicy, "id" | "tenantId" | "siteId" | "updatedAt">): Promise<SitePolicy> {
    const site = this.sites.find((item) => item.id === siteId && item.tenantId === tenant(context)); if (!site) throw new SystemDomainError("NOT_FOUND", "site not found", 404);
    const previous = this.policies.get(siteId); const value: SitePolicy = { ...input, id: previous?.id ?? randomUUID(), tenantId: tenant(context), siteId, version: (previous?.version ?? 0) + 1, updatedAt: now() }; this.policies.set(siteId, value); return value;
  }
  public async createRelease(context: TenantRequestContext, input: ReleaseInput): Promise<ConfigRelease> { if (this.releases.some((item) => item.tenantId === tenant(context) && item.releaseKey === input.releaseKey && item.status !== "retired")) throw new SystemDomainError("CONFLICT", "release_key already exists", 409); const timestamp = now(); const value: ConfigRelease = { id: randomUUID(), tenantId: tenant(context), releaseKey: input.releaseKey, status: "draft", digest: input.digest, publishedAt: null, version: 1, createdAt: timestamp, updatedAt: timestamp }; this.releases.push(value); return value; }
  public async listConfigs(context: TenantRequestContext, request: PageRequest): Promise<Page<SystemConfig>> { return page(this.configs.filter((item) => item.tenantId === null || item.tenantId === tenant(context)), request); }
  public async upsertConfig(context: TenantRequestContext, input: ConfigInput): Promise<SystemConfig> { const timestamp = now(); const tenantId = input.scopeType === "global" ? null : tenant(context); const index = this.configs.findIndex((item) => item.tenantId === tenantId && item.moduleKey === input.moduleKey && item.configKey === input.configKey && item.scopeType === input.scopeType && item.scopeId === input.scopeId && item.productId === input.productId && item.locale === input.locale && item.releaseId === input.releaseId && item.status === "active"); const existing = index < 0 ? undefined : this.configs[index]; const value: SystemConfig = { id: existing?.id ?? randomUUID(), tenantId, ...input, status: "active", configVersion: (existing?.configVersion ?? 0) + 1, digest: createHash("sha256").update(JSON.stringify(input.value)).digest("hex"), updatedAt: timestamp }; if (index < 0) this.configs.push(value); else this.configs[index] = value; return value; }
  public async getRelease(context: TenantRequestContext, releaseId: string): Promise<ConfigRelease | null> { return this.releases.find((item) => item.id === releaseId && item.tenantId === tenant(context)) ?? null; }
  public async updateRelease(context: TenantRequestContext, releaseId: string, status: ConfigRelease["status"]): Promise<ConfigRelease> { const index = this.releases.findIndex((item) => item.id === releaseId && item.tenantId === tenant(context)); if (index < 0) throw new SystemDomainError("NOT_FOUND", "release not found", 404); const current = this.releases[index]; if (!current) throw new SystemDomainError("NOT_FOUND", "release not found", 404); const value: ConfigRelease = { ...current, status, publishedAt: status === "published" ? now() : current.publishedAt, version: current.version + 1, updatedAt: now() }; this.releases[index] = value; return value; }
  public async getReceipt(tenantId: string, key: string): Promise<Readonly<{ requestHash: string; response: unknown }> | null> { return this.receipts.get(`${tenantId}:${key}`) ?? null; }
  public async saveReceipt(tenantId: string, key: string, requestHash: string, response: unknown): Promise<void> { this.receipts.set(`${tenantId}:${key}`, { requestHash, response }); }
}

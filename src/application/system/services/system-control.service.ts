import { createHash } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
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
import type {
  SystemControlDataRepository,
  SystemControlRepository,
} from "../ports/system-control-repository.js";
import type { RuntimeManifestCacheInvalidator } from "../ports/runtime-manifest-cache-invalidator.js";
import {
  parseConfigReceipt,
  parsePolicyReceipt,
  parseReleaseReceipt,
  parseSiteReceipt,
  parseWorkspaceReceipt,
} from "../mappers/receipt-result.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function commandHash(operation: string, payload: unknown): string {
  const command = canonicalize({ operation, payload });
  return createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
}
function requirePermission(
  context: TenantRequestContext,
  permission: string,
): void {
  if (!context.permissions.includes(permission))
    throw new SystemDomainError("FORBIDDEN", "permission denied", 403);
}
function requireKey(key: string): string {
  if (!key.trim() || key.length > 128)
    throw new SystemDomainError(
      "INVALID_ARGUMENT",
      "idempotency key is invalid",
    );
  return key;
}
function validPage(page: PageRequest): void {
  if (
    page.limit !== undefined &&
    (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100)
  )
    throw new SystemDomainError(
      "INVALID_ARGUMENT",
      "limit must be between 1 and 100",
    );
}
function validateText(name: string, value: string): void {
  if (!value.trim() || value.length > 160)
    throw new SystemDomainError("INVALID_ARGUMENT", `${name} is invalid`);
}

/** Application orchestration for System control-plane commands and queries. */
export class SystemControlService {
  public constructor(
    private readonly repository: SystemControlRepository,
    private readonly manifestCache: RuntimeManifestCacheInvalidator,
  ) {}

  public async listSites(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Site>> {
    requirePermission(context, "system:read");
    validPage(page);
    return this.repository.listSites(context, page);
  }
  public async createSite(
    context: TenantRequestContext,
    input: SiteInput,
    key: string,
  ): Promise<Site> {
    requirePermission(context, "system:write");
    validateText("site_key", input.siteKey);
    validateText("hostname", input.hostname);
    validateText("display_name", input.displayName);
    return this.mutate(
      context,
      key,
      "create_site",
      input,
      parseSiteReceipt,
      (repository) => repository.createSite(context, input),
    );
  }
  public async listWorkspaces(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<Workspace>> {
    requirePermission(context, "system:read");
    validPage(page);
    return this.repository.listWorkspaces(context, page);
  }
  public async createWorkspace(
    context: TenantRequestContext,
    input: WorkspaceInput,
    key: string,
  ): Promise<Workspace> {
    requirePermission(context, "system:write");
    validateText("workspace_key", input.workspaceKey);
    validateText("name", input.name);
    validateText("site_id", input.siteId);
    return this.mutate(
      context,
      key,
      "create_workspace",
      input,
      parseWorkspaceReceipt,
      (repository) => repository.createWorkspace(context, input),
    );
  }
  public async getPolicy(
    context: TenantRequestContext,
    siteId: string,
  ): Promise<SitePolicy> {
    requirePermission(context, "system:read");
    const value = await this.repository.getPolicy(context, siteId);
    if (!value)
      throw new SystemDomainError("NOT_FOUND", "site policy not found", 404);
    return value;
  }
  public async putPolicy(
    context: TenantRequestContext,
    siteId: string,
    input: SitePolicyInput,
    key: string,
  ): Promise<SitePolicy> {
    requirePermission(context, "system:write");
    return this.mutate(
      context,
      key,
      "put_site_policy",
      { siteId, ...input },
      parsePolicyReceipt,
      (repository) => repository.putPolicy(context, siteId, input),
    );
  }
  public async createRelease(
    context: TenantRequestContext,
    input: ReleaseInput,
    key: string,
  ): Promise<ConfigRelease> {
    requirePermission(context, "system:write");
    return this.mutate(
      context,
      key,
      "create_release",
      input,
      parseReleaseReceipt,
      (repository) => repository.createRelease(context, input),
    );
  }
  public async listConfigs(
    context: TenantRequestContext,
    page: PageRequest,
  ): Promise<Page<SystemConfig>> {
    requirePermission(context, "system:read");
    validPage(page);
    return this.repository.listConfigs(context, page);
  }
  public async upsertConfig(
    context: TenantRequestContext,
    input: ConfigInput,
    key: string,
  ): Promise<SystemConfig> {
    requirePermission(context, "system:write");
    validateText("module_key", input.moduleKey);
    validateText("config_key", input.configKey);
    if (input.scopeType === "tenant" && input.scopeId !== context.tenantId)
      throw new SystemDomainError(
        "FORBIDDEN",
        "tenant scope does not match request context",
        403,
      );
    if (input.scopeType === "global")
      requirePermission(context, "system:publish");
    return this.mutate(
      context,
      key,
      "upsert_config",
      input,
      parseConfigReceipt,
      (repository) => repository.upsertConfig(context, input),
    );
  }
  public async validateRelease(
    context: TenantRequestContext,
    id: string,
    key: string,
  ): Promise<ConfigRelease> {
    requirePermission(context, "system:publish");
    return this.transition(context, id, "validated", key);
  }
  public async publishRelease(
    context: TenantRequestContext,
    id: string,
    key: string,
  ): Promise<ConfigRelease> {
    requirePermission(context, "system:publish");
    return this.transition(context, id, "published", key);
  }
  public async retireRelease(
    context: TenantRequestContext,
    id: string,
    key: string,
  ): Promise<ConfigRelease> {
    requirePermission(context, "system:publish");
    return this.transition(context, id, "retired", key);
  }

  private async transition(
    context: TenantRequestContext,
    id: string,
    next: ConfigRelease["status"],
    key: string,
  ): Promise<ConfigRelease> {
    const command = { id, next };
    const release = await this.mutate(
      context,
      key,
      "transition_release",
      command,
      parseReleaseReceipt,
      async (repository) => {
        const current = await repository.getRelease(context, id);
        if (!current)
          throw new SystemDomainError("NOT_FOUND", "release not found", 404);
        const valid =
          (current.status === "draft" && next === "validated") ||
          (current.status === "validated" && next === "published") ||
          (current.status === "published" && next === "retired");
        if (!valid)
          throw new SystemDomainError(
            "INVALID_STATE",
            `release cannot transition from ${current.status} to ${next}`,
          );
        return repository.updateRelease(
          context,
          id,
          next,
          current.version,
        );
      },
    );
    if (next === "published" || next === "retired")
      await this.manifestCache.invalidateTenant(context.tenantId);
    return release;
  }

  private async mutate<T>(
    context: TenantRequestContext,
    key: string,
    commandName: string,
    commandPayload: unknown,
    replay: (value: unknown) => T,
    operation: (repository: SystemControlDataRepository) => Promise<T>,
  ): Promise<T> {
    const idempotencyKey = requireKey(key);
    const requestHash = commandHash(commandName, commandPayload);
    const result = await this.repository.executeIdempotent(
      context.tenantId,
      idempotencyKey,
      requestHash,
      operation,
    );
    return result.kind === "executed" ? result.value : replay(result.value);
  }
}

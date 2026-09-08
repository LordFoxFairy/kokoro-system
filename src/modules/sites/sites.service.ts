import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { SiteRepository } from "./site.repository.js";
import { DomainRepository } from "./domain.repository.js";
import { PolicyRepository } from "./policy.repository.js";
import { normalizeHost } from "./host-normalizer.js";
import { domainSchema, siteSchema } from "./schemas/site.schema.js";
import type {
  siteInputSchema,
  siteUpdateSchema,
} from "./schemas/site.schema.js";
import { policySchema } from "./schemas/policy.schema.js";
import type { policyInputSchema } from "./schemas/policy.schema.js";
@Injectable()
export class SitesService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(SiteRepository) private readonly sites: SiteRepository,
    @Inject(DomainRepository) private readonly domains: DomainRepository,
    @Inject(PolicyRepository) private readonly policies: PolicyRepository,
  ) {}
  public resolveManifestSite(context: RequestContext, host: string) {
    let normalized: string;
    try {
      normalized = normalizeHost(host);
    } catch {
      throw new SystemError("INVALID_ARGUMENT", "Invalid hostname");
    }
    return this.database.read(async (tx) => {
      const tenant = tenantScope(context);
      const site = await this.sites.findByHost(tx, tenant, normalized);
      if (site.status !== "active")
        throw new SystemError("POLICY_DENIED", "Site unavailable");
      const policy = await this.policies.find(tx, tenant, site.id);
      if (!policy)
        throw new SystemError("POLICY_DENIED", "Site policy required");
      return { site, policy };
    });
  }
  public async list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context);
    const query = pageQuery(input, "sites", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.sites.list(tx, tenant, query),
        query,
        "sites",
        tenant,
      ),
    );
  }
  public get(context: RequestContext, id: string) {
    return this.database.read((tx) =>
      this.sites.find(tx, tenantScope(context), id),
    );
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof siteInputSchema>,
  ) {
    let hostname: string;
    try {
      hostname = normalizeHost(input.hostname);
    } catch {
      throw new SystemError("INVALID_ARGUMENT", "Invalid hostname");
    }
    return this.receipts.run(context, input, siteSchema, (tx) =>
      this.sites.create(tx, tenantScope(context), { ...input, hostname }),
    );
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof siteUpdateSchema>,
  ) {
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: input.timezone });
      } catch {
        throw new SystemError("INVALID_ARGUMENT", "Invalid IANA timezone");
      }
    }
    return this.receipts.run(context, input, siteSchema, async (tx) => {
      const tenant = tenantScope(context);
      const site = await this.sites.find(tx, tenant, id, false, true);
      requireVersion(site.version, context.precondition);
      return this.sites.update(tx, tenant, id, input);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, siteSchema, async (tx) => {
      const tenant = tenantScope(context);
      const site = await this.sites.find(tx, tenant, id, false, true);
      requireVersion(site.version, context.precondition);
      return this.sites.remove(tx, tenant, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, siteSchema, async (tx) => {
      const tenant = tenantScope(context);
      const site = await this.sites.find(tx, tenant, id, true, true);
      requireVersion(site.version, context.precondition);
      return this.sites.restore(tx, tenant, id);
    });
  }
  public async listDomains(
    context: RequestContext,
    siteId: string,
    input: PageInput,
  ) {
    const tenant = tenantScope(context);
    const scope = JSON.stringify([tenant, siteId]);
    const query = pageQuery(input, "domains", scope);
    return this.database.read(async (tx) => {
      await this.sites.find(tx, tenant, siteId);
      return pageResult(
        await this.domains.list(tx, tenant, siteId, query),
        query,
        "domains",
        scope,
      );
    });
  }
  public addDomain(
    context: RequestContext,
    siteId: string,
    input: { hostname: string },
  ) {
    let hostname: string;
    try {
      hostname = normalizeHost(input.hostname);
    } catch {
      throw new SystemError("INVALID_ARGUMENT", "Invalid hostname");
    }
    return this.receipts.run(context, input, domainSchema, async (tx) => {
      const tenant = tenantScope(context);
      const site = await this.sites.find(tx, tenant, siteId, false, true);
      if (site.status !== "active")
        throw new SystemError("INVALID_STATE", "Site not active");
      return this.domains.create(tx, tenant, siteId, hostname);
    });
  }
  public removeDomain(context: RequestContext, siteId: string, id: string) {
    return this.receipts.run(context, null, domainSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.sites.find(tx, tenant, siteId, false, true);
      const domain = await this.domains.find(tx, tenant, siteId, id);
      requireVersion(domain.version, context.precondition);
      return this.domains.remove(tx, tenant, siteId, id);
    });
  }
  public getPolicy(context: RequestContext, siteId: string) {
    return this.database.read(async (tx) => {
      const tenant = tenantScope(context);
      await this.sites.find(tx, tenant, siteId);
      const policy = await this.policies.find(tx, tenant, siteId);
      if (!policy) throw new SystemError("NOT_FOUND", "Policy not found");
      return policy;
    });
  }
  public putPolicy(
    context: RequestContext,
    siteId: string,
    input: z.infer<typeof policyInputSchema>,
  ) {
    return this.receipts.run(context, input, policySchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.sites.find(tx, tenant, siteId, false, true);
      const current = await this.policies.find(tx, tenant, siteId);
      if (current) requireVersion(current.version, context.precondition);
      else if (context.precondition?.kind !== "create")
        throw new SystemError("VERSION_CONFLICT", "Policy does not exist");
      return this.policies.save(tx, tenant, siteId, input);
    });
  }
}

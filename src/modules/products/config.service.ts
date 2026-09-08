import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import type { TransactionContext } from "../../database/transaction-context.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ApplicationRepository } from "./application.repository.js";
import { ConfigRepository } from "./config.repository.js";
import { ReleaseRepository } from "./release.repository.js";
import { configInputSchema, configSchema } from "./schemas/config.schema.js";
import type { configUpdateSchema } from "./schemas/config.schema.js";
@Injectable()
export class ConfigService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ApplicationRepository)
    private readonly parents: ApplicationRepository,
    @Inject(ConfigRepository) private readonly configs: ConfigRepository,
    @Inject(ReleaseRepository) private readonly releases: ReleaseRepository,
  ) {}
  private async lockParents(
    tx: TransactionContext,
    tenant: string | null,
    input: z.infer<typeof configInputSchema>,
    requireActive = true,
  ) {
    if (input.scope_type === "tenant" && input.scope_id !== tenant)
      throw new SystemError("INVALID_ARGUMENT", "Tenant scope mismatch");
    if (input.site_id) {
      if (!tenant)
        throw new SystemError("INVALID_ARGUMENT", "Site requires tenant");
      await this.parents.lockSite(tx, tenant, input.site_id, requireActive);
    }
    if (input.product_id)
      await this.parents.lockProduct(tx, input.product_id, requireActive);
    if (input.release_id) {
      if (!tenant)
        throw new SystemError("INVALID_ARGUMENT", "Release requires tenant");
      await this.releases.invalidate(tx, tenant, input.release_id);
    }
  }
  public list(context: RequestContext, input: PageInput) {
    const scope = JSON.stringify([context.scope, context.tenantId]),
      query = pageQuery(input, "config", scope);
    return this.database.read(async (tx) => {
      const result = pageResult(
        await this.configs.list(tx, context.tenantId, query),
        query,
        "config",
        scope,
      );
      return {
        ...result,
        items: result.items.map((item) => {
          const { created_at, ...wire } = item;
          void created_at;
          return wire;
        }),
      };
    });
  }
  public get(context: RequestContext, id: string) {
    return this.database.read((tx) =>
      this.configs.find(tx, context.tenantId, id),
    );
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof configInputSchema>,
  ) {
    return this.receipts.run(context, input, configSchema, async (tx) => {
      await this.lockParents(tx, context.tenantId, input);
      return this.configs.create(tx, context.tenantId, context.actorId, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof configUpdateSchema>,
  ) {
    return this.receipts.run(context, input, configSchema, async (tx) => {
      const snapshot = await this.configs.find(tx, context.tenantId, id);
      const parsed = configInputSchema.safeParse({
        config_key: snapshot.config_key,
        scope_type: snapshot.scope_type,
        scope_id: snapshot.scope_id,
        product_id: snapshot.product_id,
        site_id: snapshot.site_id,
        locale: snapshot.locale,
        schema_version: snapshot.schema_version,
        release_id: snapshot.release_id,
        module_key: snapshot.module_key,
        value: input.value,
      });
      if (!parsed.success)
        throw new SystemError(
          "INVALID_CONFIG_SCHEMA",
          "Value does not match stored module",
        );
      await this.lockParents(tx, context.tenantId, parsed.data);
      const current = await this.configs.find(tx, context.tenantId, id, true);
      requireVersion(current.config_version, context.precondition);
      return this.configs.update(
        tx,
        context.tenantId,
        id,
        context.actorId,
        parsed.data.value,
      );
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, configSchema, async (tx) => {
      const snapshot = await this.configs.find(tx, context.tenantId, id);
      await this.lockParents(tx, context.tenantId, snapshot, false);
      const current = await this.configs.find(tx, context.tenantId, id, true);
      requireVersion(current.config_version, context.precondition);
      return this.configs.remove(tx, context.tenantId, id, context.actorId);
    });
  }
}

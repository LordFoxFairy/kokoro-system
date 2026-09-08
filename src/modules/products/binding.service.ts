import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import type { TransactionContext } from "../../database/transaction-context.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ApplicationRepository } from "./application.repository.js";
import { BindingRepository } from "./binding.repository.js";
import { ReleaseRepository } from "./release.repository.js";
import { bindingSchema } from "./schemas/release.schema.js";
import type { bindingInputSchema } from "./schemas/release.schema.js";
@Injectable()
export class BindingService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ApplicationRepository)
    private readonly parents: ApplicationRepository,
    @Inject(BindingRepository) private readonly bindings: BindingRepository,
    @Inject(ReleaseRepository) private readonly releases: ReleaseRepository,
  ) {}
  private async lockParents(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof bindingInputSchema>,
    requireActive = true,
  ) {
    if (input.scope_type === "tenant" && input.scope_id !== tenant)
      throw new OwnerError("INVALID_ARGUMENT", "Tenant scope mismatch");
    if (input.site_id)
      await this.parents.lockSite(tx, tenant, input.site_id, requireActive);
    await this.parents.lockProduct(tx, input.product_id, requireActive);
    const release = await this.releases.find(
      tx,
      tenant,
      input.release_id,
      true,
    );
    if (release.status !== "published")
      throw new OwnerError(
        "INVALID_STATE",
        "Binding requires published release",
        409,
      );
  }
  public list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context),
      query = pageQuery(input, "bindings", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.bindings.list(tx, tenant, query),
        query,
        "bindings",
        tenant,
      ),
    );
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof bindingInputSchema>,
  ) {
    return this.receipts.run(context, input, bindingSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.lockParents(tx, tenant, input);
      return this.bindings.create(tx, tenant, input);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, bindingSchema, async (tx) => {
      const tenant = tenantScope(context),
        snapshot = await this.bindings.find(tx, tenant, id);
      await this.lockParents(tx, tenant, snapshot, false);
      const current = await this.bindings.find(tx, tenant, id, true);
      requireVersion(current.version, context.precondition);
      return this.bindings.remove(tx, tenant, id);
    });
  }
}

import { Inject, Injectable } from "@nestjs/common";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import type { TransactionContext } from "../../database/transaction-context.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ApplicationRepository } from "./application.repository.js";
import { FeatureRepository } from "./feature.repository.js";
import { ExposureRepository } from "./exposure.repository.js";
import { exposureSchema } from "./schemas/feature.schema.js";
@Injectable()
export class ExposureService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ApplicationRepository) private readonly apps: ApplicationRepository,
    @Inject(FeatureRepository) private readonly features: FeatureRepository,
    @Inject(ExposureRepository) private readonly exposures: ExposureRepository,
  ) {}
  private async lockParents(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    featureId: string,
    requireActive = true,
  ) {
    const app = await this.apps.find(tx, tenant, appId);
    await this.apps.lockSite(tx, tenant, app.site_id, requireActive);
    await this.apps.lockProduct(tx, app.product_id, requireActive);
    await this.apps.find(tx, tenant, appId, false, true);
    const feature = await this.features.find(tx, featureId, true);
    if (feature.product_id !== app.product_id)
      throw new SystemError(
        "INVALID_ARGUMENT",
        "Feature belongs to another product",
      );
    return feature;
  }
  public list(context: RequestContext, appId: string, input: PageInput) {
    const tenant = tenantScope(context),
      scope = JSON.stringify([tenant, appId]),
      query = pageQuery(input, "exposures", scope);
    return this.database.read(async (tx) => {
      await this.apps.find(tx, tenant, appId);
      return pageResult(
        await this.exposures.list(tx, tenant, appId, query),
        query,
        "exposures",
        scope,
      );
    });
  }
  public put(
    context: RequestContext,
    appId: string,
    featureId: string,
    input: { enabled: boolean; display_order: number },
  ) {
    return this.receipts.run(context, input, exposureSchema, async (tx) => {
      const tenant = tenantScope(context);
      const feature = await this.lockParents(tx, tenant, appId, featureId);
      if (input.enabled && feature.retired_at)
        throw new SystemError("INVALID_STATE", "Feature retired");
      const prior = await this.exposures.find(tx, tenant, appId, featureId);
      if (prior) requireVersion(prior.version, context.precondition);
      else if (context.precondition?.kind !== "create")
        throw new SystemError("VERSION_CONFLICT", "Exposure does not exist");
      return this.exposures.put(tx, tenant, appId, featureId, input);
    });
  }
  public remove(context: RequestContext, appId: string, featureId: string) {
    return this.receipts.run(context, null, exposureSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.lockParents(tx, tenant, appId, featureId, false);
      const prior = await this.exposures.find(tx, tenant, appId, featureId);
      if (!prior) throw new SystemError("NOT_FOUND", "Exposure not found");
      requireVersion(prior.version, context.precondition);
      return this.exposures.remove(tx, tenant, appId, featureId);
    });
  }
}

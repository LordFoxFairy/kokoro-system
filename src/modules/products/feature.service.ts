import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { FeatureRepository } from "./feature.repository.js";
import { featureSchema } from "./schemas/feature.schema.js";
import type { featureInputSchema } from "./schemas/feature.schema.js";
@Injectable()
export class FeatureService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(FeatureRepository) private readonly features: FeatureRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "";
    const query = pageQuery(input, "features", scope);
    return this.database.read(async (tx) =>
      pageResult(await this.features.list(tx, query), query, "features", scope),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.features.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof featureInputSchema>,
  ) {
    return this.receipts.run(context, input, featureSchema, async (tx) => {
      await this.features.lockProduct(tx, input.product_id);
      return this.features.create(tx, input);
    });
  }
  public retire(context: RequestContext, id: string) {
    return this.receipts.run(context, null, featureSchema, async (tx) => {
      const snapshot = await this.features.find(tx, id);
      await this.features.lockProduct(tx, snapshot.product_id);
      const current = await this.features.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (current.retired_at)
        throw new SystemError("INVALID_STATE", "Feature already retired");
      return this.features.retire(tx, id);
    });
  }
}

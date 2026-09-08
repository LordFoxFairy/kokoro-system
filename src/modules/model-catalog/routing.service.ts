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
import { LabelRepository } from "./label.repository.js";
import { RevisionRepository } from "./revision.repository.js";
import { RoutingRepository } from "./routing.repository.js";
import { FeatureReferenceRepository } from "./feature-reference.repository.js";
import { routingSchema } from "./schemas/label.schema.js";
import type { routingInputSchema } from "./schemas/label.schema.js";
@Injectable()
export class RoutingService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(LabelRepository) private readonly labels: LabelRepository,
    @Inject(RevisionRepository) private readonly revisions: RevisionRepository,
    @Inject(RoutingRepository) private readonly routing: RoutingRepository,
    @Inject(FeatureReferenceRepository)
    private readonly features: FeatureReferenceRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const tenant = tenantScope(context),
      query = pageQuery(input, "routing", tenant);
    return this.database.read(async (tx) =>
      pageResult(
        await this.routing.list(tx, tenant, query),
        query,
        "routing",
        tenant,
      ),
    );
  }
  public put(
    context: RequestContext,
    labelId: string,
    input: z.infer<typeof routingInputSchema>,
  ) {
    return this.receipts.run(context, input, routingSchema, async (tx) => {
      const tenant = tenantScope(context),
        snapshot = await this.labels.find(tx, labelId);
      await this.features.lock(tx, [snapshot.feature_key]);
      const label = await this.labels.find(tx, labelId, false, true);
      if (input.model_revision_id) {
        const revision = await this.revisions.find(
          tx,
          input.model_revision_id,
          true,
        );
        if (
          !revision.published_at ||
          revision.retired_at ||
          revision.feature_key !== label.feature_key
        )
          throw new SystemError(
            "INVALID_STATE",
            "Route revision must be published with matching feature",
          );
      }
      const prior = await this.routing.find(tx, tenant, labelId);
      if (prior) requireVersion(prior.version, context.precondition);
      else if (context.precondition?.kind !== "create")
        throw new SystemError(
          "VERSION_CONFLICT",
          "Routing policy does not exist",
        );
      return this.routing.put(tx, tenant, labelId, label.feature_key, input);
    });
  }
  public remove(context: RequestContext, labelId: string) {
    return this.receipts.run(context, null, routingSchema, async (tx) => {
      const tenant = tenantScope(context);
      await this.labels.find(tx, labelId, false, true);
      const prior = await this.routing.find(tx, tenant, labelId);
      if (!prior)
        throw new SystemError("NOT_FOUND", "Routing policy not found");
      requireVersion(prior.version, context.precondition);
      return this.routing.remove(tx, tenant, labelId);
    });
  }
}

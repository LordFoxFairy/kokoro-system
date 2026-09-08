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
import { LabelRepository } from "./label.repository.js";
import { RevisionRepository } from "./revision.repository.js";
import { FeatureReferenceRepository } from "./feature-reference.repository.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { labelSchema } from "./schemas/label.schema.js";
import type {
  labelInputSchema,
  labelUpdateSchema,
} from "./schemas/label.schema.js";
@Injectable()
export class LabelService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(LabelRepository) private readonly labels: LabelRepository,
    @Inject(RevisionRepository) private readonly revisions: RevisionRepository,
    @Inject(FeatureReferenceRepository)
    private readonly features: FeatureReferenceRepository,
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
  ) {}
  private async validateDefault(
    tx: TransactionContext,
    feature: string,
    id: string | null,
  ) {
    if (id) {
      const revision = await this.revisions.find(tx, id, true);
      if (
        !revision.published_at ||
        revision.retired_at ||
        revision.feature_key !== feature
      )
        throw new SystemError(
          "INVALID_STATE",
          "Default revision must be published with matching feature",
        );
    }
  }
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "",
      query = pageQuery(input, "labels", scope);
    return this.database.read(async (tx) =>
      pageResult(await this.labels.list(tx, query), query, "labels", scope),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.labels.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof labelInputSchema>,
  ) {
    return this.receipts.run(context, input, labelSchema, async (tx) => {
      await this.features.lock(tx, [input.feature_key]);
      await this.validateDefault(
        tx,
        input.feature_key,
        input.default_revision_id,
      );
      await this.generation.advance(tx);
      return this.labels.create(tx, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof labelUpdateSchema>,
  ) {
    return this.receipts.run(context, input, labelSchema, async (tx) => {
      const snapshot = await this.labels.find(tx, id);
      await this.features.lock(tx, [snapshot.feature_key]);
      const current = await this.labels.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.validateDefault(
        tx,
        current.feature_key,
        input.default_revision_id === undefined
          ? current.default_revision_id
          : input.default_revision_id,
      );
      await this.generation.advance(tx);
      return this.labels.update(tx, id, input);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, labelSchema, async (tx) => {
      const current = await this.labels.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.labels.remove(tx, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, labelSchema, async (tx) => {
      const snapshot = await this.labels.find(tx, id, true);
      await this.features.lock(tx, [snapshot.feature_key]);
      const current = await this.labels.find(tx, id, true, true);
      requireVersion(current.version, context.precondition);
      await this.validateDefault(
        tx,
        current.feature_key,
        current.default_revision_id,
      );
      await this.generation.advance(tx);
      return this.labels.restore(tx, id);
    });
  }
}

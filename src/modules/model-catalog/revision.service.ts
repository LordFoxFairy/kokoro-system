import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { commandDigest } from "../../database/command-digest.js";
import type { TransactionContext } from "../../database/transaction-context.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { DefinitionRepository } from "./definition.repository.js";
import { ProviderRepository } from "./provider.repository.js";
import { RevisionRepository } from "./revision.repository.js";
import { FeatureReferenceRepository } from "./feature-reference.repository.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { revisionContent } from "./revision-content.js";
import {
  revisionSchema,
  revisionInputSchema,
} from "./schemas/revision.schema.js";
import type { revisionUpdateSchema } from "./schemas/revision.schema.js";
@Injectable()
export class RevisionService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(DefinitionRepository) private readonly models: DefinitionRepository,
    @Inject(ProviderRepository) private readonly providers: ProviderRepository,
    @Inject(RevisionRepository) private readonly revisions: RevisionRepository,
    @Inject(FeatureReferenceRepository)
    private readonly features: FeatureReferenceRepository,
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
  ) {}
  private async lockParents(
    tx: TransactionContext,
    input: z.infer<typeof revisionInputSchema>,
  ) {
    if (
      input.revision > 2147483647 ||
      (input.context_window !== null && input.context_window > 2147483647)
    )
      throw new OwnerError(
        "INVALID_ARGUMENT",
        "Revision integer exceeds storage range",
      );
    await this.features.lock(tx, [input.feature_key]);
    await this.models.find(tx, input.model_id, false, true);
    await this.providers.find(tx, input.provider_id, false, true);
  }
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "",
      query = pageQuery(input, "revisions", scope);
    return this.database.read(async (tx) =>
      pageResult(
        await this.revisions.list(tx, query),
        query,
        "revisions",
        scope,
      ),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.revisions.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof revisionInputSchema>,
  ) {
    return this.receipts.run(context, input, revisionSchema, async (tx) => {
      await this.lockParents(tx, input);
      await this.generation.advance(tx);
      return this.revisions.create(tx, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof revisionUpdateSchema>,
  ) {
    return this.receipts.run(context, input, revisionSchema, async (tx) => {
      const snapshot = await this.revisions.find(tx, id);
      const content = revisionInputSchema.parse({
        ...revisionContent(snapshot),
        ...input,
      });
      await this.lockParents(tx, content);
      const current = await this.revisions.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (current.published_at)
        throw new OwnerError(
          "INVALID_STATE",
          "Published revision is immutable",
          409,
        );
      await this.generation.advance(tx);
      return this.revisions.update(tx, id, content);
    });
  }
  public publish(context: RequestContext, id: string) {
    return this.receipts.run(context, null, revisionSchema, async (tx) => {
      const snapshot = await this.revisions.find(tx, id);
      await this.lockParents(tx, snapshot);
      const current = await this.revisions.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (current.published_at)
        throw new OwnerError(
          "INVALID_STATE",
          "Revision already published",
          409,
        );
      if (current.digest !== commandDigest(revisionContent(current)))
        throw new OwnerError("INVALID_STATE", "Revision digest mismatch", 409);
      await this.generation.advance(tx);
      return this.revisions.publish(tx, id);
    });
  }
  public retire(context: RequestContext, id: string) {
    return this.receipts.run(context, null, revisionSchema, async (tx) => {
      const snapshot = await this.revisions.find(tx, id);
      await this.lockParents(tx, snapshot);
      const current = await this.revisions.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (!current.published_at || current.retired_at)
        throw new OwnerError("INVALID_STATE", "Revision cannot retire", 409);
      await this.generation.advance(tx);
      return this.revisions.retire(tx, id);
    });
  }
}

import { SystemConfig } from "../../config/system-config.js";
import { connectionSchema } from "./schemas/connection.schema.js";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { commandDigest } from "../../database/command-digest.js";
import type { TransactionContext } from "../../database/transaction-context.js";
import { requireVersion } from "../../http/conditional-request.js";
import { SystemError } from "../../system.error.js";
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
  revisionContentSchema,
  revisionInputSchema,
} from "./schemas/revision.schema.js";
import type { revisionUpdateSchema } from "./schemas/revision.schema.js";
@Injectable()
export class RevisionService {
  public constructor(
    @Inject(SystemConfig) private readonly config: SystemConfig,
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
      (input.context_window !== null && input.context_window > 2147483647) ||
      (input.max_output_tokens !== null &&
        input.max_output_tokens > 2147483647) ||
      (input.context_window !== null &&
        input.max_output_tokens !== null &&
        input.max_output_tokens > input.context_window)
    )
      throw new SystemError(
        "INVALID_ARGUMENT",
        "Revision integer exceeds storage range",
      );
    await this.features.lock(tx, [input.feature_key]);
    await this.models.find(tx, input.model_id, false, true);
    const provider = await this.providers.find(
      tx,
      input.provider_id,
      false,
      true,
    );
    return connectionSchema.parse({
      protocol: provider.protocol,
      connection_type: provider.connection_type,
      base_url: provider.base_url,
      secret_handle_ref: provider.secret_handle_ref,
    });
  }
  private requireConnection(connection: z.infer<typeof connectionSchema>) {
    if (
      connection.base_url.startsWith("http:") &&
      !this.config.values.KOKORO_SYSTEM_ALLOW_LOOPBACK_MODEL_URL
    )
      throw new SystemError(
        "INVALID_STATE",
        "HTTP loopback model connections are disabled",
      );
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
      const connection = await this.lockParents(tx, input);
      this.requireConnection(connection);
      await this.generation.advance(tx);
      return this.revisions.create(tx, { ...input, connection });
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof revisionUpdateSchema>,
  ) {
    return this.receipts.run(context, input, revisionSchema, async (tx) => {
      const snapshot = await this.revisions.find(tx, id);
      const content = revisionContentSchema.parse({
        ...revisionContent(snapshot),
        ...input,
      });
      const connection = await this.lockParents(tx, content);
      this.requireConnection(connection);
      const current = await this.revisions.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (current.published_at)
        throw new SystemError(
          "INVALID_STATE",
          "Published revision is immutable",
        );
      await this.generation.advance(tx);
      return this.revisions.update(tx, id, { ...content, connection });
    });
  }
  public publish(context: RequestContext, id: string) {
    return this.receipts.run(context, null, revisionSchema, async (tx) => {
      const snapshot = await this.revisions.find(tx, id);
      const connection = await this.lockParents(tx, snapshot);
      this.requireConnection(connection);
      const current = await this.revisions.find(tx, id, true);
      requireVersion(current.version, context.precondition);
      if (current.published_at)
        throw new SystemError("INVALID_STATE", "Revision already published");
      if (
        current.context_window === null ||
        current.max_output_tokens === null ||
        current.max_output_tokens > current.context_window
      )
        throw new SystemError(
          "INVALID_STATE",
          "Revision execution bounds are incomplete",
        );
      if (commandDigest(current.connection) !== commandDigest(connection))
        throw new SystemError(
          "INVALID_STATE",
          "Revision connection snapshot mismatch",
        );
      if (current.digest !== commandDigest(revisionContent(current)))
        throw new SystemError("INVALID_STATE", "Revision digest mismatch");
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
        throw new SystemError("INVALID_STATE", "Revision cannot retire");
      await this.generation.advance(tx);
      return this.revisions.retire(tx, id);
    });
  }
}

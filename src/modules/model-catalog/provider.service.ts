import type { z } from "zod";
import type {
  providerInputSchema,
  providerUpdateSchema,
} from "./schemas/provider.schema.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { Inject, Injectable } from "@nestjs/common";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ProviderRepository } from "./provider.repository.js";
import { providerSchema } from "./schemas/provider.schema.js";
@Injectable()
export class ProviderService {
  public constructor(
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ProviderRepository) private readonly providers: ProviderRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "";
    const query = pageQuery(input, "providers", scope);
    return this.database.read(async (tx) =>
      pageResult(
        await this.providers.list(tx, query),
        query,
        "providers",
        scope,
      ),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.providers.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: z.infer<typeof providerInputSchema>,
  ) {
    return this.receipts.run(context, input, providerSchema, async (tx) => {
      await this.generation.advance(tx);
      return this.providers.create(tx, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: z.infer<typeof providerUpdateSchema>,
  ) {
    return this.receipts.run(context, input, providerSchema, async (tx) => {
      const current = await this.providers.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.providers.update(tx, id, input);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, providerSchema, async (tx) => {
      const current = await this.providers.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.providers.remove(tx, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, providerSchema, async (tx) => {
      const current = await this.providers.find(tx, id, true, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.providers.restore(tx, id);
    });
  }
}

import { ModelGenerationRepository } from "./model-generation.repository.js";
import { Inject, Injectable } from "@nestjs/common";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { DefinitionRepository } from "./definition.repository.js";
import { definitionSchema } from "./schemas/definition.schema.js";
@Injectable()
export class DefinitionService {
  public constructor(
    @Inject(ModelGenerationRepository)
    private readonly generation: ModelGenerationRepository,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(DefinitionRepository)
    private readonly definitions: DefinitionRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "";
    const query = pageQuery(input, "definitions", scope);
    return this.database.read(async (tx) =>
      pageResult(
        await this.definitions.list(tx, query),
        query,
        "definitions",
        scope,
      ),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.definitions.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: { model_key: string; display_name: string },
  ) {
    return this.receipts.run(context, input, definitionSchema, async (tx) => {
      await this.generation.advance(tx);
      return this.definitions.create(tx, input);
    });
  }
  public update(
    context: RequestContext,
    id: string,
    input: { display_name: string },
  ) {
    return this.receipts.run(context, input, definitionSchema, async (tx) => {
      const current = await this.definitions.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.definitions.update(tx, id, input.display_name);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, definitionSchema, async (tx) => {
      const current = await this.definitions.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.definitions.remove(tx, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, definitionSchema, async (tx) => {
      const current = await this.definitions.find(tx, id, true, true);
      requireVersion(current.version, context.precondition);
      await this.generation.advance(tx);
      return this.definitions.restore(tx, id);
    });
  }
}

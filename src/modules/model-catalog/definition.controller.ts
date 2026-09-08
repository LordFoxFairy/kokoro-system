import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { pageQuerySchema } from "../../http/protocol.schema.js";
import type { PageInput } from "../../http/pagination.js";
import { DefinitionService } from "./definition.service.js";
import {
  definitionInputSchema,
  definitionUpdateSchema,
} from "./schemas/definition.schema.js";
@Controller("v1/system/model-catalog/definitions")
export class DefinitionController {
  public constructor(
    @Inject(DefinitionService) private readonly definitions: DefinitionService,
  ) {}
  @Get()
  @Access({ operation: "listModelDefinition", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.definitions.list(context, query);
  }
  @Post()
  @Access({
    operation: "createModelDefinition",
    scope: "global",
    permission: "system:write",
  })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: definitionInputSchema })
    input: z.infer<typeof definitionInputSchema>,
  ) {
    return this.definitions.create(context, input);
  }
  @Get(":model_id")
  @Access({ operation: "getModelDefinition", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("model_id", { schema: z.uuid() }) id: string,
  ) {
    return this.definitions.get(context, id);
  }
  @Patch(":model_id")
  @Access({
    operation: "updateModelDefinition",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("model_id", { schema: z.uuid() }) id: string,
    @Body({ schema: definitionUpdateSchema })
    input: z.infer<typeof definitionUpdateSchema>,
  ) {
    return this.definitions.update(context, id, input);
  }
  @Delete(":model_id")
  @Access({
    operation: "deleteModelDefinition",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("model_id", { schema: z.uuid() }) id: string,
  ) {
    return this.definitions.remove(context, id);
  }
  @Post(":model_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreModelDefinition",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("model_id", { schema: z.uuid() }) id: string,
  ) {
    return this.definitions.restore(context, id);
  }
}

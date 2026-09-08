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
import { ProviderService } from "./provider.service.js";
import {
  providerInputSchema,
  providerUpdateSchema,
} from "./schemas/provider.schema.js";
@Controller("v1/system/model-catalog/providers")
export class ProviderController {
  public constructor(
    @Inject(ProviderService) private readonly providers: ProviderService,
  ) {}
  @Get()
  @Access({ operation: "listModelProvider", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.providers.list(context, query);
  }
  @Post()
  @Access({
    operation: "createModelProvider",
    scope: "global",
    permission: "system:write",
  })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: providerInputSchema })
    input: z.infer<typeof providerInputSchema>,
  ) {
    return this.providers.create(context, input);
  }
  @Get(":provider_id")
  @Access({ operation: "getModelProvider", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("provider_id", { schema: z.uuid() }) id: string,
  ) {
    return this.providers.get(context, id);
  }
  @Patch(":provider_id")
  @Access({
    operation: "updateModelProvider",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("provider_id", { schema: z.uuid() }) id: string,
    @Body({ schema: providerUpdateSchema })
    input: z.infer<typeof providerUpdateSchema>,
  ) {
    return this.providers.update(context, id, input);
  }
  @Delete(":provider_id")
  @Access({
    operation: "deleteModelProvider",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("provider_id", { schema: z.uuid() }) id: string,
  ) {
    return this.providers.remove(context, id);
  }
  @Post(":provider_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreModelProvider",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("provider_id", { schema: z.uuid() }) id: string,
  ) {
    return this.providers.restore(context, id);
  }
}

import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { PresentationService } from "./presentation.service.js";
import {
  presentationInputSchema,
  presentationQuerySchema,
} from "./schemas/presentation.schema.js";
@Controller("v1/system/applications/:application_id/presentation")
export class PresentationController {
  public constructor(
    @Inject(PresentationService)
    private readonly presentations: PresentationService,
  ) {}
  @Get()
  @Access({ operation: "getPresentation", permission: "system:read" })
  public get(
    @Context() c: RequestContext,
    @Param("application_id", { schema: z.uuid() }) appId: string,
    @Query({ schema: presentationQuerySchema })
    query: z.infer<typeof presentationQuerySchema>,
  ) {
    return this.presentations.get(c, appId, query);
  }
  @Put()
  @Access({
    operation: "putPresentation",
    permission: "system:write",
    cas: "upsert",
  })
  public put(
    @Context() c: RequestContext,
    @Param("application_id", { schema: z.uuid() }) appId: string,
    @Query({ schema: presentationQuerySchema })
    query: z.infer<typeof presentationQuerySchema>,
    @Body({ schema: presentationInputSchema })
    input: z.infer<typeof presentationInputSchema>,
  ) {
    return this.presentations.put(c, appId, query, input);
  }
}

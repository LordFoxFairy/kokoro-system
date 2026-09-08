import {
  Body,
  Controller,
  Delete,
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
import { pageQuerySchema } from "../../http/protocol.schema.js";
import type { PageInput } from "../../http/pagination.js";
import { RoutingService } from "./routing.service.js";
import { routingInputSchema } from "./schemas/label.schema.js";
@Controller("v1/system/model-catalog/routing-policies")
export class RoutingController {
  public constructor(
    @Inject(RoutingService) private readonly routing: RoutingService,
  ) {}
  @Get()
  @Access({ operation: "listRoutingPolicy", permission: "system:read" })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: pageQuerySchema }) q: PageInput,
  ) {
    return this.routing.list(c, q);
  }
  @Put(":label_id")
  @Access({
    operation: "putRoutingPolicy",
    permission: "system:write",
    cas: "upsert",
  })
  public put(
    @Context() c: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
    @Body({ schema: routingInputSchema })
    input: z.infer<typeof routingInputSchema>,
  ) {
    return this.routing.put(c, id, input);
  }
  @Delete(":label_id")
  @Access({
    operation: "deleteRoutingPolicy",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() c: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
  ) {
    return this.routing.remove(c, id);
  }
}

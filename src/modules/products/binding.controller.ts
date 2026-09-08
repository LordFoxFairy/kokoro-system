import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { pageQuerySchema } from "../../http/protocol.schema.js";
import type { PageInput } from "../../http/pagination.js";
import { BindingService } from "./binding.service.js";
import { bindingInputSchema } from "./schemas/release.schema.js";
@Controller("v1/system/release-bindings")
export class BindingController {
  public constructor(
    @Inject(BindingService) private readonly bindings: BindingService,
  ) {}
  @Get()
  @Access({ operation: "listBinding", permission: "system:read" })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: pageQuerySchema }) q: PageInput,
  ) {
    return this.bindings.list(c, q);
  }
  @Post()
  @Access({ operation: "createBinding", permission: "system:publish" })
  public create(
    @Context() c: RequestContext,
    @Body({ schema: bindingInputSchema })
    input: z.infer<typeof bindingInputSchema>,
  ) {
    return this.bindings.create(c, input);
  }
  @Delete(":binding_id")
  @Access({
    operation: "deleteBinding",
    permission: "system:publish",
    cas: "required",
  })
  public remove(
    @Context() c: RequestContext,
    @Param("binding_id", { schema: z.uuid() }) id: string,
  ) {
    return this.bindings.remove(c, id);
  }
}

import { Body, Controller, HttpCode, Inject, Post } from "@nestjs/common";
import type { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { ResolveService } from "./resolve.service.js";
import { resolveInputSchema } from "./schemas/resolve.schema.js";
@Controller("v1/system/model-catalog/resolve")
export class ResolveController {
  public constructor(
    @Inject(ResolveService) private readonly resolver: ResolveService,
  ) {}
  @Post()
  @HttpCode(200)
  @Access({
    operation: "resolveModel",
    permission: "service-context",
    mutation: false,
  })
  public resolve(
    @Context() c: RequestContext,
    @Body({ schema: resolveInputSchema })
    input: z.infer<typeof resolveInputSchema>,
  ) {
    return this.resolver.resolve(c, input);
  }
}

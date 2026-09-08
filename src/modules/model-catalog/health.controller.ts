import { Body, Controller, Inject, Param, Put } from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { HealthService } from "./health.service.js";
import { healthInputSchema } from "./schemas/provider.schema.js";
@Controller("v1/system/model-catalog/providers/:provider_id/health")
export class HealthController {
  public constructor(
    @Inject(HealthService) private readonly health: HealthService,
  ) {}
  @Put()
  @Access({
    operation: "putProviderHealth",
    permission: "system:write",
    scope: "global",
    cas: "upsert",
  })
  public put(
    @Context() c: RequestContext,
    @Param("provider_id", { schema: z.uuid() }) id: string,
    @Body({ schema: healthInputSchema })
    input: z.infer<typeof healthInputSchema>,
  ) {
    return this.health.put(c, id, input);
  }
}

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
import { ExposureService } from "./exposure.service.js";
import { exposureInputSchema } from "./schemas/feature.schema.js";
@Controller("v1/system/applications/:application_id/exposures")
export class ExposureController {
  public constructor(
    @Inject(ExposureService) private readonly exposures: ExposureService,
  ) {}
  @Get()
  @Access({ operation: "listExposure", permission: "system:read" })
  public list(
    @Context() c: RequestContext,
    @Param("application_id", { schema: z.uuid() }) appId: string,
    @Query({ schema: pageQuerySchema }) q: PageInput,
  ) {
    return this.exposures.list(c, appId, q);
  }
  @Put(":feature_id")
  @Access({
    operation: "putExposure",
    permission: "system:write",
    cas: "upsert",
  })
  public put(
    @Context() c: RequestContext,
    @Param("application_id", { schema: z.uuid() }) appId: string,
    @Param("feature_id", { schema: z.uuid() }) featureId: string,
    @Body({ schema: exposureInputSchema })
    input: z.infer<typeof exposureInputSchema>,
  ) {
    return this.exposures.put(c, appId, featureId, input);
  }
  @Delete(":feature_id")
  @Access({
    operation: "deleteExposure",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() c: RequestContext,
    @Param("application_id", { schema: z.uuid() }) appId: string,
    @Param("feature_id", { schema: z.uuid() }) featureId: string,
  ) {
    return this.exposures.remove(c, appId, featureId);
  }
}

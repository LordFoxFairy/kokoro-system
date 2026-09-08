import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { FeatureService } from "./feature.service.js";
import { featureInputSchema } from "./schemas/feature.schema.js";
@Controller("v1/system/features")
export class FeatureController {
  public constructor(
    @Inject(FeatureService) private readonly features: FeatureService,
  ) {}
  @Get()
  @Access({ operation: "listFeature", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.features.list(context, query);
  }
  @Get(":feature_id")
  @Access({ operation: "getFeature", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("feature_id", { schema: z.uuid() }) id: string,
  ) {
    return this.features.get(context, id);
  }
  @Post()
  @Access({
    operation: "createFeature",
    permission: "system:publish",
    scope: "global",
  })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: featureInputSchema })
    input: z.infer<typeof featureInputSchema>,
  ) {
    return this.features.create(context, input);
  }
  @Post(":feature_id/retire")
  @HttpCode(200)
  @Access({
    operation: "retireFeature",
    permission: "system:publish",
    scope: "global",
    cas: "required",
  })
  public retire(
    @Context() context: RequestContext,
    @Param("feature_id", { schema: z.uuid() }) id: string,
  ) {
    return this.features.retire(context, id);
  }
}

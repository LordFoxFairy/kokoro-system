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
import { ReleaseService } from "./release.service.js";
import { releaseInputSchema } from "./schemas/release.schema.js";
@Controller("v1/system/releases")
export class ReleaseController {
  public constructor(
    @Inject(ReleaseService) private readonly releases: ReleaseService,
  ) {}
  @Get()
  @Access({ operation: "listRelease", permission: "system:read" })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: pageQuerySchema }) q: PageInput,
  ) {
    return this.releases.list(c, q);
  }
  @Get(":release_id")
  @Access({ operation: "getRelease", permission: "system:read" })
  public get(
    @Context() c: RequestContext,
    @Param("release_id", { schema: z.uuid() }) id: string,
  ) {
    return this.releases.get(c, id);
  }
  @Post()
  @Access({ operation: "createRelease", permission: "system:write" })
  public create(
    @Context() c: RequestContext,
    @Body({ schema: releaseInputSchema })
    input: z.infer<typeof releaseInputSchema>,
  ) {
    return this.releases.create(c, input);
  }
  @Post(":release_id/validate")
  @HttpCode(200)
  @Access({
    operation: "validateRelease",
    permission: "system:publish",
    cas: "required",
  })
  public validate(
    @Context() c: RequestContext,
    @Param("release_id", { schema: z.uuid() }) id: string,
  ) {
    return this.releases.validate(c, id);
  }
  @Post(":release_id/publish")
  @HttpCode(200)
  @Access({
    operation: "publishRelease",
    permission: "system:publish",
    cas: "required",
  })
  public publish(
    @Context() c: RequestContext,
    @Param("release_id", { schema: z.uuid() }) id: string,
  ) {
    return this.releases.publish(c, id);
  }
  @Post(":release_id/retire")
  @HttpCode(200)
  @Access({
    operation: "retireRelease",
    permission: "system:publish",
    cas: "required",
  })
  public retire(
    @Context() c: RequestContext,
    @Param("release_id", { schema: z.uuid() }) id: string,
  ) {
    return this.releases.retire(c, id);
  }
}

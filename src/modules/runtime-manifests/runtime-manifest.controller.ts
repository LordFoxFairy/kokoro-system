import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import type { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { forwardedHost } from "../../http/forwarded-host.js";
import { RuntimeManifestService } from "./runtime-manifest.service.js";
import { manifestQuerySchema } from "./schemas/manifest.schema.js";
@Controller("v1/system/runtime-manifest")
export class RuntimeManifestController {
  public constructor(
    @Inject(RuntimeManifestService)
    private readonly manifests: RuntimeManifestService,
  ) {}
  @Get()
  @Access({
    operation: "getRuntimeManifest",
    permission: "service-context-and-site-policy",
  })
  public get(
    @Context() c: RequestContext,
    @Headers("forwarded") forwarded: string | undefined,
    @Headers("host") host: string | undefined,
    @Query({ schema: manifestQuerySchema })
    query: z.infer<typeof manifestQuerySchema>,
  ) {
    return this.manifests.get(c, forwardedHost(forwarded, host), query);
  }
}

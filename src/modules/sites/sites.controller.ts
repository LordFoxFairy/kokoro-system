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
  Put,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { pageQuerySchema } from "../../http/protocol.schema.js";
import type { PageInput } from "../../http/pagination.js";
import { SitesService } from "./sites.service.js";
import {
  domainInputSchema,
  siteInputSchema,
  siteUpdateSchema,
} from "./schemas/site.schema.js";
import { policyInputSchema } from "./schemas/policy.schema.js";
@Controller("v1/system/sites")
export class SitesController {
  public constructor(
    @Inject(SitesService) private readonly sites: SitesService,
  ) {}
  @Get()
  @Access({ operation: "listSite", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.sites.list(context, query);
  }
  @Post()
  @Access({ operation: "createSite", permission: "system:write" })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: siteInputSchema }) input: z.infer<typeof siteInputSchema>,
  ) {
    return this.sites.create(context, input);
  }
  @Get(":site_id")
  @Access({ operation: "getSite", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
  ) {
    return this.sites.get(context, id);
  }
  @Patch(":site_id")
  @Access({
    operation: "updateSite",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
    @Body({ schema: siteUpdateSchema }) input: z.infer<typeof siteUpdateSchema>,
  ) {
    return this.sites.update(context, id, input);
  }
  @Delete(":site_id")
  @Access({
    operation: "deleteSite",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
  ) {
    return this.sites.remove(context, id);
  }
  @Post(":site_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreSite",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
  ) {
    return this.sites.restore(context, id);
  }
  @Get(":site_id/domains")
  @Access({ operation: "listDomain", permission: "system:read" })
  public listDomains(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.sites.listDomains(context, id, query);
  }
  @Post(":site_id/domains")
  @Access({ operation: "addDomain", permission: "system:write" })
  public addDomain(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
    @Body({ schema: domainInputSchema })
    input: z.infer<typeof domainInputSchema>,
  ) {
    return this.sites.addDomain(context, id, input);
  }
  @Delete(":site_id/domains/:domain_id")
  @Access({
    operation: "removeDomain",
    permission: "system:write",
    cas: "required",
  })
  public removeDomain(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) siteId: string,
    @Param("domain_id", { schema: z.uuid() }) id: string,
  ) {
    return this.sites.removeDomain(context, siteId, id);
  }
  @Get(":site_id/policy")
  @Access({ operation: "getPolicy", permission: "system:read" })
  public getPolicy(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
  ) {
    return this.sites.getPolicy(context, id);
  }
  @Put(":site_id/policy")
  @Access({ operation: "putPolicy", permission: "system:write", cas: "upsert" })
  public putPolicy(
    @Context() context: RequestContext,
    @Param("site_id", { schema: z.uuid() }) id: string,
    @Body({ schema: policyInputSchema })
    input: z.infer<typeof policyInputSchema>,
  ) {
    return this.sites.putPolicy(context, id, input);
  }
}

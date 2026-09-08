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
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { pageQuerySchema } from "../../http/protocol.schema.js";
import type { PageInput } from "../../http/pagination.js";
import { ApplicationService } from "./application.service.js";
import {
  applicationInputSchema,
  applicationUpdateSchema,
} from "./schemas/application.schema.js";
@Controller("v1/system/applications")
export class ApplicationController {
  public constructor(
    @Inject(ApplicationService)
    private readonly applications: ApplicationService,
  ) {}
  @Get()
  @Access({ operation: "listApplication", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.applications.list(context, query);
  }
  @Post()
  @Access({ operation: "createApplication", permission: "system:write" })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: applicationInputSchema })
    input: z.infer<typeof applicationInputSchema>,
  ) {
    return this.applications.create(context, input);
  }
  @Get(":application_id")
  @Access({ operation: "getApplication", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("application_id", { schema: z.uuid() }) id: string,
  ) {
    return this.applications.get(context, id);
  }
  @Patch(":application_id")
  @Access({
    operation: "updateApplication",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("application_id", { schema: z.uuid() }) id: string,
    @Body({ schema: applicationUpdateSchema })
    input: z.infer<typeof applicationUpdateSchema>,
  ) {
    return this.applications.update(context, id, input);
  }
  @Delete(":application_id")
  @Access({
    operation: "deleteApplication",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("application_id", { schema: z.uuid() }) id: string,
  ) {
    return this.applications.remove(context, id);
  }
  @Post(":application_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreApplication",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("application_id", { schema: z.uuid() }) id: string,
  ) {
    return this.applications.restore(context, id);
  }
}

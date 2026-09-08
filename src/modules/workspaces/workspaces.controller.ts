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
import { WorkspacesService } from "./workspaces.service.js";
import {
  workspaceInputSchema,
  workspaceUpdateSchema,
} from "./schemas/workspace.schema.js";
@Controller("v1/system/workspaces")
export class WorkspacesController {
  public constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
  ) {}
  @Get()
  @Access({ operation: "listWorkspace", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.workspaces.list(context, query);
  }
  @Post()
  @Access({ operation: "createWorkspace", permission: "system:write" })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: workspaceInputSchema })
    input: z.infer<typeof workspaceInputSchema>,
  ) {
    return this.workspaces.create(context, input);
  }
  @Get(":workspace_id")
  @Access({ operation: "getWorkspace", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("workspace_id", { schema: z.uuid() }) id: string,
  ) {
    return this.workspaces.get(context, id);
  }
  @Patch(":workspace_id")
  @Access({
    operation: "updateWorkspace",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("workspace_id", { schema: z.uuid() }) id: string,
    @Body({ schema: workspaceUpdateSchema })
    input: z.infer<typeof workspaceUpdateSchema>,
  ) {
    return this.workspaces.update(context, id, input);
  }
  @Delete(":workspace_id")
  @Access({
    operation: "deleteWorkspace",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("workspace_id", { schema: z.uuid() }) id: string,
  ) {
    return this.workspaces.remove(context, id);
  }
  @Post(":workspace_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreWorkspace",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("workspace_id", { schema: z.uuid() }) id: string,
  ) {
    return this.workspaces.restore(context, id);
  }
}

import {
  Body,
  Controller,
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
import { RevisionService } from "./revision.service.js";
import {
  revisionInputSchema,
  revisionUpdateSchema,
} from "./schemas/revision.schema.js";
@Controller("v1/system/model-catalog/revisions")
export class RevisionController {
  public constructor(
    @Inject(RevisionService) private readonly revisions: RevisionService,
  ) {}
  @Get()
  @Access({ operation: "listModelRevision", permission: "system:read" })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: pageQuerySchema }) q: PageInput,
  ) {
    return this.revisions.list(c, q);
  }
  @Get(":revision_id")
  @Access({ operation: "getModelRevision", permission: "system:read" })
  public get(
    @Context() c: RequestContext,
    @Param("revision_id", { schema: z.uuid() }) id: string,
  ) {
    return this.revisions.get(c, id);
  }
  @Post()
  @Access({
    operation: "createModelRevision",
    scope: "global",
    permission: "system:write",
  })
  public create(
    @Context() c: RequestContext,
    @Body({ schema: revisionInputSchema })
    input: z.infer<typeof revisionInputSchema>,
  ) {
    return this.revisions.create(c, input);
  }
  @Patch(":revision_id")
  @Access({
    operation: "updateModelRevisionDraft",
    permission: "system:write",
    scope: "global",
    cas: "required",
  })
  public update(
    @Context() c: RequestContext,
    @Param("revision_id", { schema: z.uuid() }) id: string,
    @Body({ schema: revisionUpdateSchema })
    input: z.infer<typeof revisionUpdateSchema>,
  ) {
    return this.revisions.update(c, id, input);
  }
  @Post(":revision_id/publish")
  @HttpCode(200)
  @Access({
    operation: "publishModelRevision",
    scope: "global",
    permission: "system:publish",
    cas: "required",
  })
  public publish(
    @Context() c: RequestContext,
    @Param("revision_id", { schema: z.uuid() }) id: string,
  ) {
    return this.revisions.publish(c, id);
  }
  @Post(":revision_id/retire")
  @HttpCode(200)
  @Access({
    operation: "retireModelRevision",
    scope: "global",
    permission: "system:publish",
    cas: "required",
  })
  public retire(
    @Context() c: RequestContext,
    @Param("revision_id", { schema: z.uuid() }) id: string,
  ) {
    return this.revisions.retire(c, id);
  }
}

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
import { LabelService } from "./label.service.js";
import { labelInputSchema, labelUpdateSchema } from "./schemas/label.schema.js";
@Controller("v1/system/model-catalog/labels")
export class LabelController {
  public constructor(
    @Inject(LabelService) private readonly labels: LabelService,
  ) {}
  @Get()
  @Access({ operation: "listModelLabel", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.labels.list(context, query);
  }
  @Post()
  @Access({
    operation: "createModelLabel",
    scope: "global",
    permission: "system:write",
  })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: labelInputSchema })
    input: z.infer<typeof labelInputSchema>,
  ) {
    return this.labels.create(context, input);
  }
  @Get(":label_id")
  @Access({ operation: "getModelLabel", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
  ) {
    return this.labels.get(context, id);
  }
  @Patch(":label_id")
  @Access({
    operation: "updateModelLabel",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
    @Body({ schema: labelUpdateSchema })
    input: z.infer<typeof labelUpdateSchema>,
  ) {
    return this.labels.update(context, id, input);
  }
  @Delete(":label_id")
  @Access({
    operation: "deleteModelLabel",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
  ) {
    return this.labels.remove(context, id);
  }
  @Post(":label_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreModelLabel",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("label_id", { schema: z.uuid() }) id: string,
  ) {
    return this.labels.restore(context, id);
  }
}

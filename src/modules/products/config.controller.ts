import {
  Body,
  Controller,
  Delete,
  Get,
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
import { ConfigService } from "./config.service.js";
import {
  configInputSchema,
  configUpdateSchema,
  configListQuerySchema,
  configScopeQuerySchema,
} from "./schemas/config.schema.js";
@Controller("v1/system/config")
export class ConfigController {
  public constructor(
    @Inject(ConfigService) private readonly configs: ConfigService,
  ) {}
  @Get()
  @Access({
    operation: "listConfig",
    permission: "system:read",
    scope: "conditional",
  })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: configListQuerySchema })
    query: z.infer<typeof configListQuerySchema>,
  ) {
    return this.configs.list(c, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
  }
  @Get(":config_id")
  @Access({
    operation: "getConfig",
    permission: "system:read",
    scope: "conditional",
  })
  public get(
    @Context() c: RequestContext,
    @Param("config_id", { schema: z.uuid() }) id: string,
    @Query({ schema: configScopeQuerySchema })
    _query: z.infer<typeof configScopeQuerySchema>,
  ) {
    void _query;
    return this.configs.get(c, id);
  }
  @Post()
  @Access({
    operation: "saveConfig",
    permission: "system:write",
    scope: "conditional",
  })
  public create(
    @Context() c: RequestContext,
    @Body({ schema: configInputSchema })
    input: z.infer<typeof configInputSchema>,
  ) {
    return this.configs.create(c, input);
  }
  @Patch(":config_id")
  @Access({
    operation: "updateConfig",
    permission: "system:write",
    scope: "conditional",
    cas: "required",
  })
  public update(
    @Context() c: RequestContext,
    @Param("config_id", { schema: z.uuid() }) id: string,
    @Query({ schema: configScopeQuerySchema })
    _query: z.infer<typeof configScopeQuerySchema>,
    @Body({ schema: configUpdateSchema })
    input: z.infer<typeof configUpdateSchema>,
  ) {
    void _query;
    return this.configs.update(c, id, input);
  }
  @Delete(":config_id")
  @Access({
    operation: "deleteConfig",
    permission: "system:write",
    scope: "conditional",
    cas: "required",
  })
  public remove(
    @Context() c: RequestContext,
    @Param("config_id", { schema: z.uuid() }) id: string,
    @Query({ schema: configScopeQuerySchema })
    _query: z.infer<typeof configScopeQuerySchema>,
  ) {
    void _query;
    return this.configs.remove(c, id);
  }
}

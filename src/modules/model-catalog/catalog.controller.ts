import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { CatalogService } from "./catalog.service.js";
import { catalogQuerySchema } from "./schemas/resolve.schema.js";
@Controller("v1/system/model-catalog/catalog")
export class CatalogController {
  public constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}
  @Get()
  @Access({ operation: "getModelCatalog", permission: "service-context" })
  public list(
    @Context() c: RequestContext,
    @Query({ schema: catalogQuerySchema })
    query: z.infer<typeof catalogQuerySchema>,
  ) {
    return this.catalog.list(c, query);
  }
}

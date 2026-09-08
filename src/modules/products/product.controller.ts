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
import { ProductService } from "./product.service.js";
import {
  productInputSchema,
  productUpdateSchema,
} from "./schemas/product.schema.js";
@Controller("v1/system/products")
export class ProductController {
  public constructor(
    @Inject(ProductService) private readonly products: ProductService,
  ) {}
  @Get()
  @Access({ operation: "listProduct", permission: "system:read" })
  public list(
    @Context() context: RequestContext,
    @Query({ schema: pageQuerySchema }) query: PageInput,
  ) {
    return this.products.list(context, query);
  }
  @Post()
  @Access({
    operation: "createProduct",
    scope: "global",
    permission: "system:write",
  })
  public create(
    @Context() context: RequestContext,
    @Body({ schema: productInputSchema })
    input: z.infer<typeof productInputSchema>,
  ) {
    return this.products.create(context, input);
  }
  @Get(":product_id")
  @Access({ operation: "getProduct", permission: "system:read" })
  public get(
    @Context() context: RequestContext,
    @Param("product_id", { schema: z.uuid() }) id: string,
  ) {
    return this.products.get(context, id);
  }
  @Patch(":product_id")
  @Access({
    operation: "updateProduct",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public update(
    @Context() context: RequestContext,
    @Param("product_id", { schema: z.uuid() }) id: string,
    @Body({ schema: productUpdateSchema })
    input: z.infer<typeof productUpdateSchema>,
  ) {
    return this.products.update(context, id, input);
  }
  @Delete(":product_id")
  @Access({
    operation: "deleteProduct",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public remove(
    @Context() context: RequestContext,
    @Param("product_id", { schema: z.uuid() }) id: string,
  ) {
    return this.products.remove(context, id);
  }
  @Post(":product_id/restore")
  @HttpCode(200)
  @Access({
    operation: "restoreProduct",
    scope: "global",
    permission: "system:write",
    cas: "required",
  })
  public restore(
    @Context() context: RequestContext,
    @Param("product_id", { schema: z.uuid() }) id: string,
  ) {
    return this.products.restore(context, id);
  }
}

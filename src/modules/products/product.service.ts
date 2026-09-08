import { Inject, Injectable } from "@nestjs/common";
import type { RequestContext } from "../../access/request-context.js";
import { DatabaseService } from "../../database/database.service.js";
import { CommandReceipt } from "../../database/command-receipt.js";
import { requireVersion } from "../../http/conditional-request.js";
import { OwnerError } from "../../http/owner-error.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import type { PageInput } from "../../http/pagination.js";
import { ProductRepository } from "./product.repository.js";
import { productSchema } from "./schemas/product.schema.js";
@Injectable()
export class ProductService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CommandReceipt) private readonly receipts: CommandReceipt,
    @Inject(ProductRepository) private readonly products: ProductRepository,
  ) {}
  public list(context: RequestContext, input: PageInput) {
    const scope = context.tenantId ?? "";
    const query = pageQuery(input, "products", scope);
    return this.database.read(async (tx) =>
      pageResult(await this.products.list(tx, query), query, "products", scope),
    );
  }
  public get(_context: RequestContext, id: string) {
    return this.database.read((tx) => this.products.find(tx, id));
  }
  public create(
    context: RequestContext,
    input: { product_key: string; name: string },
  ) {
    return this.receipts.run(context, input, productSchema, (tx) =>
      this.products.create(tx, input),
    );
  }
  public update(context: RequestContext, id: string, input: { name: string }) {
    return this.receipts.run(context, input, productSchema, async (tx) => {
      const current = await this.products.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.products.update(tx, id, input.name);
    });
  }
  public remove(context: RequestContext, id: string) {
    return this.receipts.run(context, null, productSchema, async (tx) => {
      const current = await this.products.find(tx, id, false, true);
      requireVersion(current.version, context.precondition);
      return this.products.remove(tx, id, context.actorId);
    });
  }
  public restore(context: RequestContext, id: string) {
    return this.receipts.run(context, null, productSchema, async (tx) => {
      const current = await this.products.find(tx, id, true, true);
      requireVersion(current.version, context.precondition);
      if (!current.deleted_at)
        throw new OwnerError("INVALID_STATE", "Product not deleted", 409);
      return this.products.restore(tx, id);
    });
  }
}

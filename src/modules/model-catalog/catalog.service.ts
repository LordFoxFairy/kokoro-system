import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../../access/request-context.js";
import { tenantScope } from "../../access/tenant-scope.js";
import { DatabaseService } from "../../database/database.service.js";
import { pageQuery, pageResult } from "../../http/pagination.js";
import { CatalogRepository } from "./catalog.repository.js";
import type { catalogQuerySchema } from "./schemas/resolve.schema.js";
@Injectable()
export class CatalogService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
  ) {}
  public list(
    context: RequestContext,
    input: z.infer<typeof catalogQuerySchema>,
  ) {
    const tenant = tenantScope(context),
      scope = JSON.stringify([tenant, input.feature_key ?? null]);
    const query = pageQuery(
      {
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      },
      "model-catalog",
      scope,
    );
    return this.database.read(async (tx) => {
      const result = pageResult(
        await this.catalog.list(tx, tenant, input.feature_key, query),
        query,
        "model-catalog",
        scope,
      );
      return {
        ...result,
        items: result.items.map(({ id, created_at, ...wire }) => {
          void id;
          void created_at;
          return wire;
        }),
      };
    });
  }
}

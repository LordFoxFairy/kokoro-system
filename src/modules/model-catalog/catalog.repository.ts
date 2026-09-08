import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import type { PageQuery } from "../../database/page-query.js";
import { catalogItemSchema } from "./schemas/resolve.schema.js";
@Injectable()
export class CatalogRepository {
  public async list(
    tx: TransactionContext,
    tenant: string,
    feature: string | undefined,
    query: PageQuery,
  ) {
    const result = await tx.query(
      "SELECT l.id,l.created_at,l.label_key AS key,l.display_name,p.is_default,l.feature_key,l.default_revision_id FROM model_label l JOIN model_routing_policy p ON p.label_id=l.id AND p.feature_key=l.feature_key JOIN system_feature_definition f ON f.global_feature_key=l.feature_key JOIN system_product pr ON pr.id=f.product_id WHERE p.tenant_id=$1 AND p.visible AND l.deleted_at IS NULL AND f.retired_at IS NULL AND pr.deleted_at IS NULL AND pr.status='active' AND ($2::text IS NULL OR l.feature_key=$2) AND ($3::timestamptz IS NULL OR (l.created_at,l.id)<($3::timestamptz,$4::uuid)) ORDER BY l.created_at DESC,l.id DESC LIMIT $5",
      [
        tenant,
        feature ?? null,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => {
      const { id, created_at, ...wire } = row;
      return {
        id: String(id),
        created_at: (created_at as Date).toISOString(),
        ...catalogItemSchema.parse(wire),
      };
    });
  }
}

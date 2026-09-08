import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { routingSchema } from "./schemas/label.schema.js";
import type { routingInputSchema } from "./schemas/label.schema.js";
const columns =
  "id,tenant_id,label_id,feature_key,model_revision_id,visible,is_default,priority,version,created_at,updated_at";
@Injectable()
export class RoutingRepository {
  public async find(tx: TransactionContext, tenant: string, label: string) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_routing_policy WHERE tenant_id=$1 AND label_id=$2 FOR UPDATE`,
      [tenant, label],
    );
    return result.rows[0] ? decodeRow(routingSchema, result.rows[0]) : null;
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_routing_policy WHERE tenant_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(routingSchema, row));
  }
  public async put(
    tx: TransactionContext,
    tenant: string,
    label: string,
    feature: string,
    input: z.infer<typeof routingInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO model_routing_policy(id,tenant_id,label_id,feature_key,model_revision_id,visible,is_default,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,label_id) DO UPDATE SET model_revision_id=EXCLUDED.model_revision_id,visible=EXCLUDED.visible,is_default=EXCLUDED.is_default,priority=EXCLUDED.priority,version=model_routing_policy.version+1,updated_at=CURRENT_TIMESTAMP(3) RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        label,
        feature,
        input.model_revision_id,
        input.visible,
        input.is_default,
        input.priority,
      ],
    );
    return decodeRow(routingSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, tenant: string, label: string) {
    const result = await tx.query(
      `DELETE FROM model_routing_policy WHERE tenant_id=$1 AND label_id=$2 RETURNING ${columns}`,
      [tenant, label],
    );
    return decodeRow(routingSchema, result.rows[0]!);
  }
}

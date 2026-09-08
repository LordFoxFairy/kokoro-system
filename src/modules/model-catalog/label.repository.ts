import type { z } from "zod";
import type {
  labelInputSchema,
  labelUpdateSchema,
} from "./schemas/label.schema.js";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { labelSchema } from "./schemas/label.schema.js";
const columns =
  "id,label_key,display_name,feature_key,default_revision_id,version,created_at,updated_at,deleted_at";
@Injectable()
export class LabelRepository {
  public async find(
    tx: TransactionContext,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_label WHERE id=$1 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0]) throw new SystemError("NOT_FOUND", "Label not found");
    return decodeRow(labelSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_label WHERE deleted_at IS NULL AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(labelSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: z.infer<typeof labelInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO model_label(id,label_key,display_name,feature_key,default_revision_id) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,
      [
        randomUUID(),
        input.label_key,
        input.display_name,
        input.feature_key,
        input.default_revision_id,
      ],
    );
    return decodeRow(labelSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    id: string,
    input: z.infer<typeof labelUpdateSchema>,
  ) {
    const result = await tx.query(
      `UPDATE model_label SET display_name=COALESCE($2,display_name),default_revision_id=CASE WHEN $3 THEN $4::uuid ELSE default_revision_id END,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [
        id,
        input.display_name ?? null,
        Object.hasOwn(input, "default_revision_id"),
        input.default_revision_id ?? null,
      ],
    );
    return decodeRow(labelSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, id: string, actor: string) {
    const references = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM model_routing_policy WHERE label_id=$1) AS used",
      [id],
    );
    if (references.rows[0]?.used)
      throw new SystemError("RESOURCE_IN_USE", "Label has live references");
    const result = await tx.query(
      `UPDATE model_label SET deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, actor],
    );
    return decodeRow(labelSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `UPDATE model_label SET deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 AND deleted_at > clock_timestamp()-INTERVAL '30 days' RETURNING ${columns}`,
      [id],
    );
    if (!result.rowCount)
      throw new SystemError(
        "INVALID_STATE",
        "Resource is outside its restore window",
      );
    return decodeRow(labelSchema, result.rows[0]!);
  }
}

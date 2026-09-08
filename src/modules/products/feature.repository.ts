import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { featureSchema } from "./schemas/feature.schema.js";
import type { featureInputSchema } from "./schemas/feature.schema.js";
const columns =
  "id,product_id,global_feature_key,display_name,result_contract,version,created_at,retired_at";
@Injectable()
export class FeatureRepository {
  public async lockProduct(tx: TransactionContext, id: string) {
    const result = await tx.query<{ id: string }>(
      "SELECT id FROM system_product WHERE id=$1 AND deleted_at IS NULL AND status='active' FOR UPDATE",
      [id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Product not found", 404);
  }
  public async find(tx: TransactionContext, id: string, lock = false) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_feature_definition WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Feature not found", 404);
    return decodeRow(featureSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_feature_definition WHERE ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(featureSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: z.infer<typeof featureInputSchema>,
  ) {
    const result = await tx
      .query(
        `INSERT INTO system_feature_definition(id,product_id,global_feature_key,display_name,result_contract) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,
        [
          randomUUID(),
          input.product_id,
          input.global_feature_key,
          input.display_name,
          JSON.stringify(input.result_contract),
        ],
      )
      .catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23514" &&
          "constraint" in error &&
          error.constraint === "ck_system_feature_contract"
        )
          throw new OwnerError(
            "INVALID_ARGUMENT",
            "Input exceeds stored representation limits",
            400,
          );
        throw error;
      });
    return decodeRow(featureSchema, result.rows[0]!);
  }
  public async retire(tx: TransactionContext, id: string) {
    const references = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM system_app_feature_exposure e JOIN system_application a ON a.id=e.application_id AND a.tenant_id=e.tenant_id WHERE e.feature_id=$1 AND e.enabled AND a.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM model_label l JOIN system_feature_definition f ON f.global_feature_key=l.feature_key WHERE f.id=$1 AND l.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM model_revision r JOIN system_feature_definition f ON f.global_feature_key=r.feature_key WHERE f.id=$1 AND r.retired_at IS NULL) AS used",
      [id],
    );
    if (references.rows[0]?.used)
      throw new OwnerError("RESOURCE_IN_USE", "Feature is exposed", 409);
    const result = await tx.query(
      `UPDATE system_feature_definition SET retired_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE id=$1 RETURNING ${columns}`,
      [id],
    );
    return decodeRow(featureSchema, result.rows[0]!);
  }
}

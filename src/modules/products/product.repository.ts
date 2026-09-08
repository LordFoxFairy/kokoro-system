import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { productSchema } from "./schemas/product.schema.js";
const columns =
  "id,product_key,name,status,version,created_at,updated_at,deleted_at";
@Injectable()
export class ProductRepository {
  public async find(
    tx: TransactionContext,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_product WHERE id=$1 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Product not found", 404);
    return decodeRow(productSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_product WHERE deleted_at IS NULL AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(productSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: { product_key: string; name: string },
  ) {
    const result = await tx.query(
      `INSERT INTO system_product(id,product_key,name,status) VALUES($1,$2,$3,'active') RETURNING ${columns}`,
      [randomUUID(), input.product_key, input.name],
    );
    return decodeRow(productSchema, result.rows[0]!);
  }
  public async update(tx: TransactionContext, id: string, name: string) {
    const result = await tx.query(
      `UPDATE system_product SET name=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, name],
    );
    return decodeRow(productSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, id: string, actor: string) {
    const references = await tx.query<{ used: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM system_application WHERE product_id=$1 AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM system_feature_definition WHERE product_id=$1 AND retired_at IS NULL) OR EXISTS(SELECT 1 FROM system_config_record WHERE product_id=$1 AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM system_release_binding WHERE product_id=$1 AND status='active') OR EXISTS(SELECT 1 FROM system_site_policy p JOIN system_product q ON q.id=$1 WHERE p.status='active' AND p.allowed_products_json ? q.product_key) AS used`,
      [id],
    );
    if (references.rows[0]?.used)
      throw new OwnerError(
        "RESOURCE_IN_USE",
        "Product has live references",
        409,
      );
    const result = await tx.query(
      `UPDATE system_product SET status='archived',deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, actor],
    );
    return decodeRow(productSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `UPDATE system_product SET status='active',deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id],
    );
    return decodeRow(productSchema, result.rows[0]!);
  }
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { definitionSchema } from "./schemas/definition.schema.js";
const columns =
  "id,model_key,display_name,version,created_at,updated_at,deleted_at";
@Injectable()
export class DefinitionRepository {
  public async find(
    tx: TransactionContext,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_definition WHERE id=$1 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new SystemError("NOT_FOUND", "Model definition not found");
    return decodeRow(definitionSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_definition WHERE deleted_at IS NULL AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(definitionSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: { model_key: string; display_name: string },
  ) {
    const result = await tx.query(
      `INSERT INTO model_definition(id,model_key,display_name) VALUES($1,$2,$3) RETURNING ${columns}`,
      [randomUUID(), input.model_key, input.display_name],
    );
    return decodeRow(definitionSchema, result.rows[0]!);
  }
  public async update(tx: TransactionContext, id: string, displayName: string) {
    const result = await tx.query(
      `UPDATE model_definition SET display_name=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, displayName],
    );
    return decodeRow(definitionSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, id: string, actor: string) {
    const references = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM model_revision WHERE model_id=$1 AND retired_at IS NULL) AS used",
      [id],
    );
    if (references.rows[0]?.used)
      throw new SystemError(
        "RESOURCE_IN_USE",
        "Model definition has live references",
      );
    const result = await tx.query(
      `UPDATE model_definition SET deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, actor],
    );
    return decodeRow(definitionSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `UPDATE model_definition SET deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 AND deleted_at > clock_timestamp()-INTERVAL '30 days' RETURNING ${columns}`,
      [id],
    );
    if (!result.rowCount)
      throw new SystemError(
        "INVALID_STATE",
        "Resource is outside its restore window",
      );
    return decodeRow(definitionSchema, result.rows[0]!);
  }
}

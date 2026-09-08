import type { z } from "zod";
import type {
  providerInputSchema,
  providerUpdateSchema,
} from "./schemas/provider.schema.js";
import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { providerSchema } from "./schemas/provider.schema.js";
const columns =
  "id,provider,provider_key,display_name,secret_handle_ref,transport,priority,version,created_at,updated_at,deleted_at";
@Injectable()
export class ProviderRepository {
  public async find(
    tx: TransactionContext,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_provider WHERE id=$1 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new SystemError("NOT_FOUND", "Provider not found");
    return decodeRow(providerSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_provider WHERE deleted_at IS NULL AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(providerSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: z.infer<typeof providerInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO model_provider(id,provider,provider_key,display_name,secret_handle_ref,transport,priority) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
      [
        randomUUID(),
        input.provider,
        input.provider_key,
        input.display_name,
        input.secret_handle_ref,
        input.transport,
        input.priority,
      ],
    );
    return decodeRow(providerSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    id: string,
    input: z.infer<typeof providerUpdateSchema>,
  ) {
    const result = await tx.query(
      `UPDATE model_provider SET display_name=COALESCE($2,display_name),secret_handle_ref=COALESCE($3,secret_handle_ref),priority=COALESCE($4,priority),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [
        id,
        input.display_name ?? null,
        input.secret_handle_ref ?? null,
        input.priority ?? null,
      ],
    );
    return decodeRow(providerSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, id: string, actor: string) {
    const references = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM model_revision WHERE provider_id=$1 AND retired_at IS NULL) AS used",
      [id],
    );
    if (references.rows[0]?.used)
      throw new SystemError("RESOURCE_IN_USE", "Provider has live references");
    await tx.query(
      "DELETE FROM model_provider_health_state WHERE provider_id=$1",
      [id],
    );
    const result = await tx.query(
      `UPDATE model_provider SET deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$2,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id, actor],
    );
    return decodeRow(providerSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `UPDATE model_provider SET deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 AND deleted_at > clock_timestamp()-INTERVAL '30 days' RETURNING ${columns}`,
      [id],
    );
    if (!result.rowCount)
      throw new SystemError(
        "INVALID_STATE",
        "Resource is outside its restore window",
      );
    return decodeRow(providerSchema, result.rows[0]!);
  }
}

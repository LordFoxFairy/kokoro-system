import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { bindingSchema } from "./schemas/release.schema.js";
import type { bindingInputSchema } from "./schemas/release.schema.js";
const columns =
  "id,tenant_id,site_id,product_id,scope_type,scope_id,release_id,status,version,created_at,updated_at";
@Injectable()
export class BindingRepository {
  public async find(
    tx: TransactionContext,
    tenant: string,
    id: string,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_release_binding WHERE tenant_id=$1 AND id=$2 AND status='active' ${lock ? "FOR UPDATE" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0])
      throw new SystemError("NOT_FOUND", "Binding not found");
    return decodeRow(bindingSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_release_binding WHERE tenant_id=$1 AND status='active' AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(bindingSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof bindingInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO system_release_binding(id,tenant_id,site_id,product_id,scope_type,scope_id,release_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        input.site_id,
        input.product_id,
        input.scope_type,
        input.scope_id,
        input.release_id,
      ],
    );
    return decodeRow(bindingSchema, result.rows[0]!);
  }
  public async remove(tx: TransactionContext, tenant: string, id: string) {
    const result = await tx.query(
      `UPDATE system_release_binding SET status='archived',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id],
    );
    return decodeRow(bindingSchema, result.rows[0]!);
  }
}

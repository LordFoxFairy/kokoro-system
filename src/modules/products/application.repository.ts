import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { applicationSchema } from "./schemas/application.schema.js";
import type { applicationInputSchema } from "./schemas/application.schema.js";
const columns =
  "id,tenant_id,site_id,product_id,app_key,display_name,version,created_at,updated_at,deleted_at";
@Injectable()
export class ApplicationRepository {
  public async lockSite(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    requireActive = true,
  ): Promise<void> {
    const result = await tx.query<{ id: string; status: string }>(
      "SELECT id,status FROM system_site WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE",
      [tenant, siteId],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Site not found", 404);
    if (requireActive && result.rows[0].status !== "active")
      throw new OwnerError("SITE_UNAVAILABLE", "Site is unavailable", 409);
  }
  public async lockProduct(
    tx: TransactionContext,
    id: string,
    requireActive = true,
  ): Promise<void> {
    const result = await tx.query<{ id: string; status: string }>(
      "SELECT id,status FROM system_product WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Product not found", 404);
    if (requireActive && result.rows[0].status !== "active")
      throw new OwnerError("INVALID_STATE", "Product unavailable", 409);
  }
  public async find(
    tx: TransactionContext,
    tenant: string,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_application WHERE tenant_id=$1 AND id=$2 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Application not found", 404);
    return decodeRow(applicationSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_application WHERE tenant_id=$1 AND deleted_at IS NULL AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(applicationSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof applicationInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO system_application (id,tenant_id,site_id,product_id,app_key,display_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        input.site_id,
        input.product_id,
        input.app_key,
        input.display_name,
      ],
    );
    return decodeRow(applicationSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    tenant: string,
    id: string,
    displayName: string,
  ) {
    const result = await tx.query(
      `UPDATE system_application SET display_name=$3,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, displayName],
    );
    return decodeRow(applicationSchema, result.rows[0]!);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string,
    id: string,
    actor: string,
  ) {
    const result = await tx.query(
      `UPDATE system_application SET deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$3,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, actor],
    );
    return decodeRow(applicationSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, tenant: string, id: string) {
    const invalid = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM system_app_feature_exposure e JOIN system_feature_definition f ON f.id=e.feature_id WHERE e.tenant_id=$1 AND e.application_id=$2 AND e.enabled AND f.retired_at IS NOT NULL) AS used",
      [tenant, id],
    );
    if (invalid.rows[0]?.used)
      throw new OwnerError(
        "INVALID_STATE",
        "Application exposes retired feature",
        409,
      );
    const result = await tx.query(
      `UPDATE system_application SET deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id],
    );
    return decodeRow(applicationSchema, result.rows[0]!);
  }
}

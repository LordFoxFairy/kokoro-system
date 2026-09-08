import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { workspaceSchema } from "./schemas/workspace.schema.js";
import type { workspaceInputSchema } from "./schemas/workspace.schema.js";
const columns =
  "id,tenant_id,site_id,workspace_key,name,status,version,created_at,updated_at,deleted_at";
@Injectable()
export class WorkspaceRepository {
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
  public async find(
    tx: TransactionContext,
    tenant: string,
    id: string,
    deleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_workspace WHERE tenant_id=$1 AND id=$2 ${deleted ? "" : "AND deleted_at IS NULL"} ${lock ? "FOR UPDATE" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Workspace not found", 404);
    return decodeRow(workspaceSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_workspace WHERE tenant_id=$1 AND deleted_at IS NULL AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(workspaceSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof workspaceInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO system_workspace (id,tenant_id,site_id,workspace_key,name,status) VALUES ($1,$2,$3,$4,$5,'active') RETURNING ${columns}`,
      [randomUUID(), tenant, input.site_id, input.workspace_key, input.name],
    );
    return decodeRow(workspaceSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    tenant: string,
    id: string,
    name: string,
  ) {
    const result = await tx.query(
      `UPDATE system_workspace SET name=$3,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, name],
    );
    return decodeRow(workspaceSchema, result.rows[0]!);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string,
    id: string,
    actor: string,
  ) {
    const result = await tx.query(
      `UPDATE system_workspace SET status='archived',deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$3,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, actor],
    );
    return decodeRow(workspaceSchema, result.rows[0]!);
  }
  public async restore(tx: TransactionContext, tenant: string, id: string) {
    const result = await tx.query(
      `UPDATE system_workspace SET status='active',deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 AND deleted_at > clock_timestamp()-INTERVAL '30 days' RETURNING ${columns}`,
      [tenant, id],
    );
    if (!result.rowCount)
      throw new OwnerError(
        "INVALID_STATE",
        "Resource is outside its restore window",
        409,
      );
    return decodeRow(workspaceSchema, result.rows[0]!);
  }
}

import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { siteSchema } from "./schemas/site.schema.js";
import type {
  siteInputSchema,
  siteUpdateSchema,
} from "./schemas/site.schema.js";
const columns =
  "s.id,s.tenant_id,s.site_key,s.display_name,s.timezone,s.status,s.version,s.created_at,s.updated_at,s.deleted_at,ARRAY(SELECT h.hostname FROM system_site_host h WHERE h.tenant_id=s.tenant_id AND h.site_id=s.id AND h.status='active' ORDER BY h.hostname) AS hostnames";
@Injectable()
export class SiteRepository {
  public async findByHost(
    tx: TransactionContext,
    tenant: string,
    host: string,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_site s JOIN system_site_host h ON h.site_id=s.id AND h.tenant_id=s.tenant_id WHERE s.tenant_id=$1 AND h.hostname=$2 AND h.status='active' AND s.deleted_at IS NULL`,
      [tenant, host],
    );
    if (!result.rows[0]) throw new SystemError("NOT_FOUND", "Site not found");
    return decodeRow(siteSchema, result.rows[0]);
  }
  public async find(
    tx: TransactionContext,
    tenant: string,
    id: string,
    includeDeleted = false,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_site s WHERE s.tenant_id=$1 AND s.id=$2 ${includeDeleted ? "" : "AND s.deleted_at IS NULL"} ${lock ? "FOR UPDATE OF s" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0]) throw new SystemError("NOT_FOUND", "Site not found");
    return decodeRow(siteSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_site s WHERE s.tenant_id=$1 AND s.deleted_at IS NULL AND ($2::timestamptz IS NULL OR (s.created_at,s.id)<($2::timestamptz,$3::uuid)) ORDER BY s.created_at DESC,s.id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(siteSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof siteInputSchema>,
  ) {
    const id = randomUUID();
    await tx.query(
      "INSERT INTO system_site (id,tenant_id,site_key,display_name,status) VALUES ($1,$2,$3,$4,'active')",
      [id, tenant, input.site_key, input.display_name],
    );
    try {
      await tx.query(
        "INSERT INTO system_site_host (id,tenant_id,site_id,hostname) VALUES ($1,$2,$3,$4)",
        [randomUUID(), tenant, id, input.hostname],
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        throw new SystemError("HOST_CONFLICT", "Hostname already registered");
      throw error;
    }
    return this.find(tx, tenant, id);
  }
  public async update(
    tx: TransactionContext,
    tenant: string,
    id: string,
    input: z.infer<typeof siteUpdateSchema>,
  ) {
    await tx.query(
      "UPDATE system_site SET display_name=COALESCE($3,display_name),timezone=COALESCE($4,timezone),status=COALESCE($5,status),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [
        tenant,
        id,
        input.display_name ?? null,
        input.timezone ?? null,
        input.status ?? null,
      ],
    );
    return this.find(tx, tenant, id);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string,
    id: string,
    actor: string,
  ) {
    const references = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM system_workspace WHERE tenant_id=$1 AND site_id=$2 AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM system_application WHERE tenant_id=$1 AND site_id=$2 AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM system_release_binding WHERE tenant_id=$1 AND site_id=$2 AND status='active') OR EXISTS(SELECT 1 FROM system_config_record WHERE tenant_id=$1 AND site_id=$2 AND status='active') AS used",
      [tenant, id],
    );
    if (references.rows[0]?.used)
      throw new SystemError("RESOURCE_IN_USE", "Site has live references");
    await tx.query(
      "UPDATE system_site SET status='archived',deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$3,updated_at=CURRENT_TIMESTAMP(3),version=version+1 WHERE tenant_id=$1 AND id=$2 AND deleted_at IS NULL",
      [tenant, id, actor],
    );
    await tx.query(
      "UPDATE system_site_host SET status='archived',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND site_id=$2 AND status='active'",
      [tenant, id],
    );
    return this.find(tx, tenant, id, true);
  }
  public async restore(tx: TransactionContext, tenant: string, id: string) {
    const result = await tx.query(
      "UPDATE system_site SET status='active',deleted_at=NULL,deleted_by=NULL,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 AND deleted_at > clock_timestamp()-INTERVAL '30 days'",
      [tenant, id],
    );
    if (!result.rowCount)
      throw new SystemError(
        "INVALID_STATE",
        "Resource is outside its restore window",
      );
    return this.find(tx, tenant, id);
  }
}

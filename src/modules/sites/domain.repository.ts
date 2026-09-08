import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import { SystemError } from "../../system.error.js";
import type { PageQuery } from "../../database/page-query.js";
import { domainSchema } from "./schemas/site.schema.js";
const columns =
  "id,tenant_id,site_id,hostname,status,version,created_at,updated_at";
@Injectable()
export class DomainRepository {
  public async list(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    query: PageQuery,
  ) {
    const rows = await tx.query(
      `SELECT ${columns} FROM system_site_host WHERE tenant_id=$1 AND site_id=$2 AND status='active' AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,
      [
        tenant,
        siteId,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return rows.rows.map((row) => decodeRow(domainSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    hostname: string,
  ) {
    try {
      const result = await tx.query(
        `INSERT INTO system_site_host (id,tenant_id,site_id,hostname) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,site_id,hostname) DO UPDATE SET status='active',version=system_site_host.version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE system_site_host.status='archived' RETURNING ${columns}`,
        [randomUUID(), tenant, siteId, hostname],
      );
      if (!result.rows[0])
        throw new SystemError("HOST_CONFLICT", "Hostname already registered");
      await tx.query(
        "UPDATE system_site SET version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2",
        [tenant, siteId],
      );
      return decodeRow(domainSchema, result.rows[0]);
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
  }
  public async find(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    id: string,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_site_host WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND status='active' FOR UPDATE`,
      [tenant, siteId, id],
    );
    if (!result.rows[0]) throw new SystemError("NOT_FOUND", "Domain not found");
    return decodeRow(domainSchema, result.rows[0]);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    id: string,
  ) {
    const result = await tx.query(
      `UPDATE system_site_host SET status='archived',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND site_id=$2 AND id=$3 RETURNING ${columns}`,
      [tenant, siteId, id],
    );
    await tx.query(
      "UPDATE system_site SET version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2",
      [tenant, siteId],
    );
    return decodeRow(domainSchema, result.rows[0]!);
  }
}

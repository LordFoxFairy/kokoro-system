import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { commandDigest } from "../../database/command-digest.js";
import { configInputSchema } from "./schemas/config.schema.js";
import { releaseSchema } from "./schemas/release.schema.js";
const columns =
  "id,tenant_id,release_key,status,digest,published_at,version,created_at,updated_at";
@Injectable()
export class ReleaseRepository {
  public async find(
    tx: TransactionContext,
    tenant: string,
    id: string,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_config_release WHERE tenant_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0])
      throw new SystemError("NOT_FOUND", "Release not found");
    return decodeRow(releaseSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, tenant: string, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_config_release WHERE tenant_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(releaseSchema, row));
  }
  public async create(
    tx: TransactionContext,
    tenant: string,
    input: { release_key: string; digest: string },
  ) {
    const result = await tx.query(
      `INSERT INTO system_config_release(id,tenant_id,release_key,digest,status) VALUES($1,$2,$3,$4,'draft') RETURNING ${columns}`,
      [randomUUID(), tenant, input.release_key, input.digest],
    );
    return decodeRow(releaseSchema, result.rows[0]!);
  }
  public async invalidate(tx: TransactionContext, tenant: string, id: string) {
    const current = await this.find(tx, tenant, id, true);
    if (current.status !== "draft" && current.status !== "validated")
      throw new SystemError("INVALID_STATE", "Published release is immutable");
    await tx.query(
      "UPDATE system_config_release SET status='draft',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2",
      [tenant, id],
    );
  }
  public async contentDigest(
    tx: TransactionContext,
    tenant: string,
    id: string,
  ) {
    const result = await tx.query(
      "SELECT module_key,scope_type,scope_id,product_id,site_id,locale,config_key,schema_version,value_json FROM system_config_record WHERE tenant_id=$1 AND release_id=$2 AND status='active' ORDER BY module_key,config_key,id",
      [tenant, id],
    );
    if (!result.rows.length)
      throw new SystemError("INVALID_STATE", "Release has no configuration");
    for (const row of result.rows) {
      const { value_json, ...identity } = row;
      const parsed = configInputSchema.safeParse({
        ...identity,
        value: value_json,
        release_id: id,
      });
      if (!parsed.success)
        throw new SystemError(
          "INVALID_CONFIG_SCHEMA",
          "Release contains invalid configuration",
        );
    }
    const references = await tx.query<{ invalid: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM system_config_record c LEFT JOIN system_site s ON s.id=c.site_id AND s.tenant_id=c.tenant_id LEFT JOIN system_product p ON p.id=c.product_id WHERE c.tenant_id=$1 AND c.release_id=$2 AND c.status='active' AND ((c.site_id IS NOT NULL AND (s.id IS NULL OR s.deleted_at IS NOT NULL OR s.status<>'active')) OR (c.product_id IS NOT NULL AND (p.id IS NULL OR p.deleted_at IS NOT NULL OR p.status<>'active')))) AS invalid",
      [tenant, id],
    );
    if (references.rows[0]?.invalid)
      throw new SystemError(
        "INVALID_STATE",
        "Release contains unavailable references",
      );
    return commandDigest(result.rows);
  }
  public async validate(
    tx: TransactionContext,
    tenant: string,
    id: string,
    digest: string,
  ) {
    const result = await tx.query(
      `UPDATE system_config_release SET status='validated',digest=$3,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, digest],
    );
    return decodeRow(releaseSchema, result.rows[0]!);
  }
  public async publish(tx: TransactionContext, tenant: string, id: string) {
    const result = await tx.query(
      `UPDATE system_config_release SET status='published',published_at=CURRENT_TIMESTAMP(3),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id],
    );
    return decodeRow(releaseSchema, result.rows[0]!);
  }
  public async retire(tx: TransactionContext, tenant: string, id: string) {
    await tx.query(
      "UPDATE system_release_binding SET status='archived',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND release_id=$2 AND status='active'",
      [tenant, id],
    );
    const result = await tx.query(
      `UPDATE system_config_release SET status='retired',version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 RETURNING ${columns}`,
      [tenant, id],
    );
    return decodeRow(releaseSchema, result.rows[0]!);
  }
}

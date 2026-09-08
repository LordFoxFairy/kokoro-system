import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { commandDigest } from "../../database/command-digest.js";
import { configSchema } from "./schemas/config.schema.js";
import type { configInputSchema } from "./schemas/config.schema.js";
const columns =
  "id,tenant_id,site_id,module_key,scope_type,scope_id,product_id,locale,config_key,schema_version,value_json AS value,status,config_version,release_id,digest,updated_at";
@Injectable()
export class ConfigRepository {
  public async find(
    tx: TransactionContext,
    tenant: string | null,
    id: string,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_config_record WHERE tenant_id IS NOT DISTINCT FROM $1 AND id=$2 AND status='active' ${lock ? "FOR UPDATE" : ""}`,
      [tenant, id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Config not found", 404);
    return decodeRow(configSchema, result.rows[0]);
  }
  public async list(
    tx: TransactionContext,
    tenant: string | null,
    query: PageQuery,
  ) {
    const result = await tx.query(
      `SELECT ${columns},created_at FROM system_config_record WHERE tenant_id IS NOT DISTINCT FROM $1 AND status='active' AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
      [
        tenant,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => {
      const { created_at, ...wire } = row;
      return {
        ...decodeRow(configSchema, wire),
        created_at: (created_at as Date).toISOString(),
      };
    });
  }
  public async create(
    tx: TransactionContext,
    tenant: string | null,
    actor: string,
    input: z.infer<typeof configInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO system_config_record(id,tenant_id,site_id,module_key,scope_type,scope_id,product_id,locale,config_key,schema_version,value_json,status,release_id,digest,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13,$14) RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        input.site_id ?? null,
        input.module_key,
        input.scope_type,
        input.scope_id,
        input.product_id,
        input.locale,
        input.config_key,
        input.schema_version,
        JSON.stringify(input.value),
        input.release_id,
        commandDigest(input.value),
        actor,
      ],
    );
    return decodeRow(configSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    tenant: string | null,
    id: string,
    actor: string,
    value: unknown,
  ) {
    const result = await tx.query(
      `UPDATE system_config_record SET value_json=$3,digest=$4,config_version=config_version+1,updated_by=$5,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id IS NOT DISTINCT FROM $1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, JSON.stringify(value), commandDigest(value), actor],
    );
    return decodeRow(configSchema, result.rows[0]!);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string | null,
    id: string,
    actor: string,
  ) {
    const result = await tx.query(
      `UPDATE system_config_record SET status='deleted',deleted_at=CURRENT_TIMESTAMP(3),deleted_by=$3,config_version=config_version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id IS NOT DISTINCT FROM $1 AND id=$2 RETURNING ${columns}`,
      [tenant, id, actor],
    );
    return decodeRow(configSchema, result.rows[0]!);
  }
}

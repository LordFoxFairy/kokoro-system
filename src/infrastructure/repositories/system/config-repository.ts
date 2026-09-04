import { createHash, randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type {
  ConfigInput,
  Page,
  PageRequest,
} from "../../../application/system/dto/index.js";
import type { SystemConfig } from "../../../domain/system/models/index.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import {
  PostgresRepository,
  cursorId,
  pageLimit,
  utcTimestamp,
  toPage,
} from "./support.js";
import { mapConfig } from "./mappers.js";
import type { Row } from "./support.js";
import {
  decodeEnum,
  decodeIntegerString,
  decodeString,
} from "../../persistence/postgres/value-decoders.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";

export class PostgresConfigRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }
  public async list(
    context: TenantRequestContext,
    request: PageRequest,
  ): Promise<Page<SystemConfig>> {
    return this.withTransaction(async (client) => {
      const limit = pageLimit(request);
      const cursor = cursorId(request);
      const result = await client.query<Row>(
        "SELECT id, tenant_id, module_key, config_key, scope_type, scope_id, product_id, locale, value_json, schema_version, status, config_version, release_id, digest, updated_at FROM system_config_record WHERE status = 'active' AND (tenant_id IS NULL OR tenant_id = $1) AND ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3",
        [context.tenantId, cursor, limit + 1],
      );
      return toPage(result.rows.map(mapConfig), limit);
    });
  }
  public async upsert(
    context: TenantRequestContext,
    input: ConfigInput,
  ): Promise<SystemConfig> {
    return this.withTransaction(async (client) => {
      if (input.releaseId !== null) {
        const release = await client.query<Row>(
          "SELECT status FROM system_config_release WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
          [input.releaseId, context.tenantId],
        );
        const releaseRow = release.rows[0];
        if (releaseRow === undefined)
          throw new SystemDomainError("NOT_FOUND", "release not found", 404);
        const releaseStatus = decodeEnum(
          releaseRow.status,
          "system_config_release.status",
          ["draft", "validated", "published", "retired"],
        );
        if (releaseStatus !== "draft" && releaseStatus !== "validated")
          throw new SystemDomainError(
            "INVALID_STATE",
            "release is not writable",
          );
      }
      const tenantId = input.scopeType === "global" ? null : context.tenantId;
      const existing = await client.query<Row>(
        "SELECT id, config_version FROM system_config_record WHERE status = 'active' AND tenant_id IS NOT DISTINCT FROM $1::text AND module_key = $2 AND config_key = $3 AND scope_type = $4 AND scope_id IS NOT DISTINCT FROM $5::text AND product_id IS NOT DISTINCT FROM $6::uuid AND locale IS NOT DISTINCT FROM $7::varchar AND release_id IS NOT DISTINCT FROM $8::uuid LIMIT 1 FOR UPDATE",
        [
          tenantId,
          input.moduleKey,
          input.configKey,
          input.scopeType,
          input.scopeId,
          input.productId,
          input.locale,
          input.releaseId,
        ],
      );
      const existingRow = existing.rows[0];
      const id = existingRow
        ? decodeString(existingRow.id, "system_config_record.id")
        : randomUUID();
      const configVersion = existingRow
        ? (
            BigInt(
              decodeIntegerString(
                existingRow.config_version,
                "system_config_record.config_version",
              ),
            ) + 1n
          ).toString()
        : "1";
      const time = utcTimestamp();
      const digest = createHash("sha256")
        .update(JSON.stringify(input.value))
        .digest("hex");
      if (existingRow)
        await client.query(
          "UPDATE system_config_record SET schema_version = $1, value_json = $2, config_version = $3, digest = $4, updated_by = $5, updated_at = $6 WHERE id = $7",
          [
            input.schemaVersion,
            JSON.stringify(input.value),
            configVersion,
            digest,
            context.actorId,
            time,
            id,
          ],
        );
      else
        await client.query(
          "INSERT INTO system_config_record (id, tenant_id, module_key, scope_type, scope_id, product_id, locale, config_key, schema_version, value_json, status, config_version, release_id, digest, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', $11, $12, $13, $14, $15, $16)",
          [
            id,
            tenantId,
            input.moduleKey,
            input.scopeType,
            input.scopeId,
            input.productId,
            input.locale,
            input.configKey,
            input.schemaVersion,
            JSON.stringify(input.value),
            configVersion,
            input.releaseId,
            digest,
            context.actorId,
            time,
            time,
          ],
        );
      return {
        id,
        tenantId,
        ...input,
        status: "active",
        configVersion,
        digest,
        updatedAt: time,
      };
    });
  }
}

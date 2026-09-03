import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type { ReleaseInput } from "../../../application/system/dto/index.js";
import type { ConfigRelease } from "../../../domain/system/models/index.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import { PostgresRepository, requireRow, utcTimestamp } from "./support.js";
import { mapRelease } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";

export class PostgresReleaseRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }
  public async create(
    context: TenantRequestContext,
    input: ReleaseInput,
  ): Promise<ConfigRelease> {
    return this.withTransaction(async (client) => {
      const duplicate = await client.query<Row>(
        "SELECT id FROM system_config_release WHERE tenant_id = $1 AND release_key = $2 AND status <> 'retired' LIMIT 1 FOR UPDATE",
        [context.tenantId, input.releaseKey],
      );
      if (duplicate.rows.length)
        throw new SystemDomainError(
          "CONFLICT",
          "release_key already exists",
          409,
        );
      const id = randomUUID();
      const time = utcTimestamp();
      await client.query(
        "INSERT INTO system_config_release (id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at) VALUES ($1, $2, $3, 'draft', $4, NULL, 1, $5, $6)",
        [id, context.tenantId, input.releaseKey, input.digest, time, time],
      );
      return {
        id,
        tenantId: context.tenantId,
        releaseKey: input.releaseKey,
        status: "draft",
        digest: input.digest,
        publishedAt: null,
        version: 1,
        createdAt: time,
        updatedAt: time,
      };
    });
  }
  public async get(
    context: TenantRequestContext,
    releaseId: string,
  ): Promise<ConfigRelease | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<Row>(
        "SELECT id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at FROM system_config_release WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [releaseId, context.tenantId],
      );
      return result.rows[0] ? mapRelease(result.rows[0]) : null;
    });
  }
  public async update(
    context: TenantRequestContext,
    releaseId: string,
    status: ConfigRelease["status"],
    expectedVersion: number,
  ): Promise<ConfigRelease> {
    return this.withTransaction(async (client) => {
      const current = requireRow(
        (
          await client.query<Row>(
            "SELECT id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at FROM system_config_release WHERE id = $1 AND tenant_id = $2 LIMIT 1 FOR UPDATE",
            [releaseId, context.tenantId],
          )
        ).rows[0],
        "release not found",
      );
      const time = utcTimestamp();
      const updated = await client.query(
        "UPDATE system_config_release SET status = $1, published_at = $2, version = version + 1, updated_at = $3 WHERE id = $4 AND tenant_id = $5 AND version = $6",
        [
          status,
          status === "published" ? time : (current.published_at ?? null),
          time,
          releaseId,
          context.tenantId,
          expectedVersion,
        ],
      );
      if (updated.affectedRows !== 1)
        throw new SystemDomainError(
          "CONFLICT",
          "release was modified concurrently",
          409,
        );
      return mapRelease({
        ...current,
        status,
        published_at: status === "published" ? time : current.published_at,
        version: Number(current.version) + 1,
        updated_at: time,
      });
    });
  }
}

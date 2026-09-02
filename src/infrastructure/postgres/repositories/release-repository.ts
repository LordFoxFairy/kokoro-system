import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { ReleaseInput } from "../../../modules/system/application/dto.js";
import type { ConfigRelease } from "../../../modules/system/domain/models.js";
import type { SqlPool } from "../client.js";
import { PostgresRepository, requireRow, timestamp } from "./support.js";
import { mapRelease } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../modules/system/errors.js";

export class PostgresReleaseRepository extends PostgresRepository {
  public constructor(pool: SqlPool) { super(pool); }
  public async create(context: TenantRequestContext, input: ReleaseInput): Promise<ConfigRelease> { return this.withTransaction(async (client) => { const duplicate = await client.query<Row>("SELECT id FROM system_config_release WHERE tenant_id = ? AND release_key = ? AND status <> 'retired' LIMIT 1 FOR UPDATE", [context.tenantId, input.releaseKey]); if (duplicate.rows.length) throw new SystemDomainError("CONFLICT", "release_key already exists", 409); const id = randomUUID(); const time = timestamp(); await client.query("INSERT INTO system_config_release (id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at) VALUES (?, ?, ?, 'draft', ?, NULL, 1, ?, ?)", [id, context.tenantId, input.releaseKey, input.digest, time, time]); return { id, tenantId: context.tenantId, releaseKey: input.releaseKey, status: "draft", digest: input.digest, publishedAt: null, version: 1, createdAt: time, updatedAt: time }; }); }
  public async get(context: TenantRequestContext, releaseId: string): Promise<ConfigRelease | null> { return this.withTransaction(async (client) => { const result = await client.query<Row>("SELECT id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at FROM system_config_release WHERE id = ? AND tenant_id = ? LIMIT 1", [releaseId, context.tenantId]); return result.rows[0] ? mapRelease(result.rows[0]) : null; }); }
  public async update(context: TenantRequestContext, releaseId: string, status: ConfigRelease["status"]): Promise<ConfigRelease> { return this.withTransaction(async (client) => { const current = requireRow((await client.query<Row>("SELECT id, tenant_id, release_key, status, digest, published_at, version, created_at, updated_at FROM system_config_release WHERE id = ? AND tenant_id = ? LIMIT 1", [releaseId, context.tenantId])).rows[0], "release not found"); const time = timestamp(); await client.query("UPDATE system_config_release SET status = ?, published_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND tenant_id = ?", [status, status === "published" ? time : current.published_at ?? null, time, releaseId, context.tenantId]); return mapRelease({ ...current, status, published_at: status === "published" ? time : current.published_at, version: Number(current.version) + 1, updated_at: time }); }); }
}

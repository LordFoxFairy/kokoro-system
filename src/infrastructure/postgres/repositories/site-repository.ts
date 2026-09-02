import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { Page, PageRequest, SiteInput } from "../../../modules/system/application/dto.js";
import type { Site } from "../../../modules/system/domain/models.js";
import type { SqlPool } from "../client.js";
import { PostgresRepository, cursorOffset, timestamp, toPage } from "./support.js";
import { mapSite } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../modules/system/errors.js";

export class PostgresSiteRepository extends PostgresRepository {
  public constructor(pool: SqlPool) { super(pool); }
  public async list(context: TenantRequestContext, request: PageRequest): Promise<Page<Site>> { return this.withTransaction(async (client) => { const offset = cursorOffset(request); const result = await client.query<Row>("SELECT id, tenant_id, site_key, hostnames_json, display_name, status, version, created_at, updated_at FROM system_site WHERE tenant_id = ? AND status <> 'archived' ORDER BY id LIMIT ? OFFSET ?", [context.tenantId, Math.min(request.limit ?? 50, 100), offset]); const count = await client.query<Row>("SELECT COUNT(*) AS total FROM system_site WHERE tenant_id = ? AND status <> 'archived'", [context.tenantId]); return toPage(result.rows.map(mapSite), offset, Number(count.rows[0]?.total ?? 0), request.limit); }); }
  public async create(context: TenantRequestContext, input: SiteInput): Promise<Site> { return this.withTransaction(async (client) => { const duplicate = await client.query<Row>("SELECT id FROM system_site WHERE tenant_id = ? AND site_key = ? AND status <> 'archived' LIMIT 1", [context.tenantId, input.siteKey]); if (duplicate.rows.length) throw new SystemDomainError("CONFLICT", "site_key already exists", 409); const id = randomUUID(); const time = timestamp(); await client.query("INSERT INTO system_site (id, tenant_id, site_key, hostnames_json, display_name, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)", [id, context.tenantId, input.siteKey, JSON.stringify([input.hostname]), input.displayName, time, time]); return { id, tenantId: context.tenantId, siteKey: input.siteKey, hostnames: [input.hostname], displayName: input.displayName, status: "active", version: 1, createdAt: time, updatedAt: time }; }); }
}

import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { Page, PageRequest, SiteInput } from "../../../modules/system/application/dto.js";
import type { Site } from "../../../modules/system/domain/models.js";
import type { SqlPool } from "../client.js";
import { PostgresRepository, cursorOffset, timestamp, toPage } from "./support.js";
import { mapSite } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../modules/system/errors.js";
import { normalizeHost } from "../../../modules/runtime-manifest/host.js";

export class PostgresSiteRepository extends PostgresRepository {
  public constructor(pool: SqlPool) { super(pool); }
  public async list(context: TenantRequestContext, request: PageRequest): Promise<Page<Site>> { return this.withTransaction(async (client) => { const offset = cursorOffset(request); const result = await client.query<Row>("SELECT s.id, s.tenant_id, s.site_key, COALESCE(jsonb_agg(h.hostname ORDER BY h.hostname) FILTER (WHERE h.id IS NOT NULL), '[]'::jsonb) AS hostnames_json, s.display_name, s.status, s.version, s.created_at, s.updated_at FROM system_site s LEFT JOIN system_site_host h ON h.tenant_id = s.tenant_id AND h.site_id = s.id AND h.status = 'active' WHERE s.tenant_id = ? AND s.status <> 'archived' GROUP BY s.id ORDER BY s.id LIMIT ? OFFSET ?", [context.tenantId, Math.min(request.limit ?? 50, 100), offset]); const count = await client.query<Row>("SELECT COUNT(*) AS total FROM system_site WHERE tenant_id = ? AND status <> 'archived'", [context.tenantId]); return toPage(result.rows.map(mapSite), offset, Number(count.rows[0]?.total ?? 0), request.limit); }); }
  public async create(context: TenantRequestContext, input: SiteInput): Promise<Site> { return this.withTransaction(async (client) => { const hostname = normalizeHost(input.hostname); const duplicate = await client.query<Row>("SELECT id FROM system_site WHERE tenant_id = ? AND site_key = ? AND status <> 'archived' LIMIT 1", [context.tenantId, input.siteKey]); if (duplicate.rows.length) throw new SystemDomainError("CONFLICT", "site_key already exists", 409); const hostDuplicate = await client.query<Row>("SELECT site_id FROM system_site_host WHERE hostname = ? AND status = 'active' LIMIT 1", [hostname]); if (hostDuplicate.rows.length) throw new SystemDomainError("CONFLICT", "hostname already exists", 409); const id = randomUUID(); const time = timestamp(); await client.query("INSERT INTO system_site (id, tenant_id, site_key, display_name, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?)", [id, context.tenantId, input.siteKey, input.displayName, time, time]); await client.query("INSERT INTO system_site_host (id, tenant_id, site_id, hostname, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?)", [randomUUID(), context.tenantId, id, hostname, time, time]); return { id, tenantId: context.tenantId, siteKey: input.siteKey, hostnames: [hostname], displayName: input.displayName, status: "active", version: 1, createdAt: time, updatedAt: time }; }); }
}

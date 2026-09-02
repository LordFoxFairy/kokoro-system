import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { SitePolicy } from "../../../modules/system/domain/models.js";
import type { SqlPool } from "../client.js";
import { PostgresRepository, requireRow, timestamp } from "./support.js";
import { mapPolicy } from "./mappers.js";
import type { Row } from "./support.js";

export class PostgresPolicyRepository extends PostgresRepository {
  public constructor(pool: SqlPool) { super(pool); }
  public async get(context: TenantRequestContext, siteId: string): Promise<SitePolicy | null> { return this.withTransaction(async (client) => { const result = await client.query<Row>("SELECT id, tenant_id, site_id, version, status, default_locale, allowed_locales_json, allowed_products_json, public_manifest, updated_at FROM system_site_policy WHERE site_id = ? AND tenant_id = ? AND status = 'active' LIMIT 1", [siteId, context.tenantId]); return result.rows[0] ? mapPolicy(result.rows[0]) : null; }); }
  public async put(context: TenantRequestContext, siteId: string, input: Omit<SitePolicy, "id" | "tenantId" | "siteId" | "updatedAt">): Promise<SitePolicy> { return this.withTransaction(async (client) => { const site = await client.query<Row>("SELECT id FROM system_site WHERE id = ? AND tenant_id = ? LIMIT 1", [siteId, context.tenantId]); requireRow(site.rows[0], "site not found"); const old = await client.query<Row>("SELECT id, version FROM system_site_policy WHERE site_id = ? AND tenant_id = ? AND status = 'active' LIMIT 1", [siteId, context.tenantId]); const id = old.rows[0] ? String(old.rows[0].id) : randomUUID(); const version = Number(old.rows[0]?.version ?? 0) + 1; const time = timestamp(); if (old.rows[0]) await client.query("UPDATE system_site_policy SET status = 'archived', updated_at = ? WHERE id = ?", [time, id]); await client.query("INSERT INTO system_site_policy (id, tenant_id, site_id, version, status, default_locale, allowed_locales_json, allowed_products_json, public_manifest, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)", [id, context.tenantId, siteId, version, input.defaultLocale, JSON.stringify(input.allowedLocales), JSON.stringify(input.allowedProducts), input.publicManifest, time]); return { ...input, id, tenantId: context.tenantId, siteId, version, updatedAt: time }; }); }
}

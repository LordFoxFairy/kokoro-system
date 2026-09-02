import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../modules/runtime-manifest/model.js";
import type { Page, PageRequest, WorkspaceInput } from "../../../modules/system/application/dto.js";
import type { Workspace } from "../../../modules/system/domain/models.js";
import type { SqlPool } from "../client.js";
import { PostgresRepository, cursorOffset, requireRow, timestamp, toPage } from "./support.js";
import { mapWorkspace } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../modules/system/errors.js";

export class PostgresWorkspaceRepository extends PostgresRepository {
  public constructor(pool: SqlPool) { super(pool); }
  public async list(context: TenantRequestContext, request: PageRequest): Promise<Page<Workspace>> { return this.withTransaction(async (client) => { const offset = cursorOffset(request); const result = await client.query<Row>("SELECT id, tenant_id, site_id, workspace_key, name, status, version, created_at, updated_at FROM system_workspace WHERE tenant_id = ? AND status <> 'archived' ORDER BY id LIMIT ? OFFSET ?", [context.tenantId, Math.min(request.limit ?? 50, 100), offset]); const count = await client.query<Row>("SELECT COUNT(*) AS total FROM system_workspace WHERE tenant_id = ? AND status <> 'archived'", [context.tenantId]); return toPage(result.rows.map(mapWorkspace), offset, Number(count.rows[0]?.total ?? 0), request.limit); }); }
  public async create(context: TenantRequestContext, input: WorkspaceInput): Promise<Workspace> { return this.withTransaction(async (client) => { const site = await client.query<Row>("SELECT id FROM system_site WHERE id = ? AND tenant_id = ? AND status <> 'archived' LIMIT 1", [input.siteId, context.tenantId]); requireRow(site.rows[0], "site not found"); const duplicate = await client.query<Row>("SELECT id FROM system_workspace WHERE tenant_id = ? AND site_id = ? AND workspace_key = ? AND status <> 'archived' LIMIT 1", [context.tenantId, input.siteId, input.workspaceKey]); if (duplicate.rows.length) throw new SystemDomainError("CONFLICT", "workspace_key already exists", 409); const id = randomUUID(); const time = timestamp(); await client.query("INSERT INTO system_workspace (id, tenant_id, site_id, workspace_key, name, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?)", [id, context.tenantId, input.siteId, input.workspaceKey, input.name, time, time]); return { id, tenantId: context.tenantId, siteId: input.siteId, workspaceKey: input.workspaceKey, name: input.name, status: "active", version: 1, createdAt: time, updatedAt: time }; }); }
}

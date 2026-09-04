import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type {
  Page,
  PageRequest,
  WorkspaceInput,
} from "../../../application/system/dto/index.js";
import type { Workspace } from "../../../domain/system/models/index.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import {
  PostgresRepository,
  cursorId,
  pageLimit,
  requireRow,
  utcTimestamp,
  toPage,
} from "./support.js";
import { mapWorkspace } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";

export class PostgresWorkspaceRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }
  public async list(
    context: TenantRequestContext,
    request: PageRequest,
  ): Promise<Page<Workspace>> {
    return this.withTransaction(async (client) => {
      const limit = pageLimit(request);
      const cursor = cursorId(request);
      const result = await client.query<Row>(
        "SELECT id, tenant_id, site_id, workspace_key, name, status, version, created_at, updated_at FROM system_workspace WHERE tenant_id = $1 AND status <> 'archived' AND ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3",
        [context.tenantId, cursor, limit + 1],
      );
      return toPage(result.rows.map(mapWorkspace), limit);
    });
  }
  public async create(
    context: TenantRequestContext,
    input: WorkspaceInput,
  ): Promise<Workspace> {
    return this.withTransaction(async (client) => {
      const site = await client.query<Row>(
        "SELECT id FROM system_site WHERE id = $1 AND tenant_id = $2 AND status <> 'archived' LIMIT 1",
        [input.siteId, context.tenantId],
      );
      requireRow(site.rows[0], "site not found");
      const duplicate = await client.query<Row>(
        "SELECT id FROM system_workspace WHERE tenant_id = $1 AND site_id = $2 AND workspace_key = $3 AND status <> 'archived' LIMIT 1",
        [context.tenantId, input.siteId, input.workspaceKey],
      );
      if (duplicate.rows.length)
        throw new SystemDomainError(
          "CONFLICT",
          "workspace_key already exists",
          409,
        );
      const id = randomUUID();
      const time = utcTimestamp();
      await client.query(
        "INSERT INTO system_workspace (id, tenant_id, site_id, workspace_key, name, status, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, 'active', 1, $6, $7)",
        [
          id,
          context.tenantId,
          input.siteId,
          input.workspaceKey,
          input.name,
          time,
          time,
        ],
      );
      return {
        id,
        tenantId: context.tenantId,
        siteId: input.siteId,
        workspaceKey: input.workspaceKey,
        name: input.name,
        status: "active",
        version: "1",
        createdAt: time,
        updatedAt: time,
      };
    });
  }
}

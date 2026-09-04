import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type {
  Page,
  PageRequest,
  SiteInput,
} from "../../../application/system/dto/index.js";
import type { Site } from "../../../domain/system/models/index.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import {
  PostgresRepository,
  cursorId,
  pageLimit,
  utcTimestamp,
  toPage,
} from "./support.js";
import { mapSite } from "./mappers.js";
import type { Row } from "./support.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
import { normalizeHost } from "../../../domain/runtime-manifest/services/host-normalizer.js";

export class PostgresSiteRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }
  public async list(
    context: TenantRequestContext,
    request: PageRequest,
  ): Promise<Page<Site>> {
    return this.withTransaction(async (client) => {
      const limit = pageLimit(request);
      const cursor = cursorId(request);
      const result = await client.query<Row>(
        "SELECT s.id, s.tenant_id, s.site_key, COALESCE(jsonb_agg(h.hostname ORDER BY h.hostname) FILTER (WHERE h.id IS NOT NULL), '[]'::jsonb) AS hostnames_json, s.display_name, s.status, s.version, s.created_at, s.updated_at FROM system_site s LEFT JOIN system_site_host h ON h.tenant_id = s.tenant_id AND h.site_id = s.id AND h.status = 'active' WHERE s.tenant_id = $1 AND s.status <> 'archived' AND ($2::uuid IS NULL OR s.id > $2::uuid) GROUP BY s.id ORDER BY s.id LIMIT $3",
        [context.tenantId, cursor, limit + 1],
      );
      return toPage(result.rows.map(mapSite), limit);
    });
  }
  public async create(
    context: TenantRequestContext,
    input: SiteInput,
  ): Promise<Site> {
    return this.withTransaction(async (client) => {
      const hostname = normalizeHost(input.hostname);
      const duplicate = await client.query<Row>(
        "SELECT id FROM system_site WHERE tenant_id = $1 AND site_key = $2 AND status <> 'archived' LIMIT 1",
        [context.tenantId, input.siteKey],
      );
      if (duplicate.rows.length)
        throw new SystemDomainError("CONFLICT", "site_key already exists", 409);
      const hostDuplicate = await client.query<Row>(
        "SELECT site_id FROM system_site_host WHERE hostname = $1 AND status = 'active' LIMIT 1",
        [hostname],
      );
      if (hostDuplicate.rows.length)
        throw new SystemDomainError("CONFLICT", "hostname already exists", 409);
      const id = randomUUID();
      const time = utcTimestamp();
      await client.query(
        "INSERT INTO system_site (id, tenant_id, site_key, display_name, status, version, created_at, updated_at) VALUES ($1, $2, $3, $4, 'active', 1, $5, $6)",
        [id, context.tenantId, input.siteKey, input.displayName, time, time],
      );
      await client.query(
        "INSERT INTO system_site_host (id, tenant_id, site_id, hostname, status, created_at, updated_at) VALUES ($1, $2, $3, $4, 'active', $5, $6)",
        [randomUUID(), context.tenantId, id, hostname, time, time],
      );
      return {
        id,
        tenantId: context.tenantId,
        siteKey: input.siteKey,
        hostnames: [hostname],
        displayName: input.displayName,
        status: "active",
        version: "1",
        createdAt: time,
        updatedAt: time,
      };
    });
  }
}

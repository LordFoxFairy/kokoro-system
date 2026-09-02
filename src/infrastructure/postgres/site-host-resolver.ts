import type { SqlPool } from "./client.js";
import { normalizeHost } from "../../modules/runtime-manifest/host.js";
import type { SiteHostResolver } from "../../modules/runtime-manifest/ports.js";
import type { TenantRequestContext } from "../../modules/runtime-manifest/model.js";

/** Resolves Site/Host using System-owned rows; IAM is intentionally not called. */
export class PostgresSiteHostResolver implements SiteHostResolver {
  public constructor(private readonly pool: SqlPool) {}

  public async verify(input: Readonly<{ context: TenantRequestContext; host: string }>): Promise<void> {
    const host = normalizeHost(input.host);
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ id: string }>(
        `SELECT s.id FROM system_site s
         INNER JOIN system_site_host h ON h.tenant_id = s.tenant_id AND h.site_id = s.id
         WHERE s.tenant_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
           AND h.status = 'active' AND h.hostname = ?
         LIMIT 1`,
        [input.context.tenantId, host],
      );
      if (!result.rows[0]) throw new Error("site host does not match tenant context");
    } finally { client.release(); }
  }
}

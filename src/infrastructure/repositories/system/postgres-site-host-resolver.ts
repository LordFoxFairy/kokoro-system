import type { SqlPool } from "../../persistence/postgres/client.js";
import { normalizeHost } from "../../../domain/runtime-manifest/services/host-normalizer.js";
import type { SiteHostResolver } from "../../../application/runtime-manifest/ports/index.js";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type { SiteResolution } from "../../../domain/system/models/index.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
import type { Row } from "./support.js";
import { mapSiteResolution } from "./mappers.js";

/** Resolves Site/Host using System-owned rows; IAM is intentionally not called. */
export class PostgresSiteHostResolver implements SiteHostResolver {
  public constructor(private readonly pool: SqlPool) {}

  public async resolve(
    input: Readonly<{ context: TenantRequestContext; host: string }>,
  ): Promise<SiteResolution> {
    const host = normalizeHost(input.host);
    const client = await this.pool.connect();
    try {
      const result = await client.query<Row>(
        `SELECT s.id, s.site_key, h.hostname,
                COALESCE(p.default_locale, 'en-US') AS default_locale,
                s.timezone, s.version
         FROM system_site s
         INNER JOIN system_site_host h ON h.tenant_id = s.tenant_id AND h.site_id = s.id
         LEFT JOIN system_site_policy p ON p.tenant_id = s.tenant_id AND p.site_id = s.id AND p.status = 'active'
         WHERE s.tenant_id = $1 AND s.status = 'active' AND s.deleted_at IS NULL
           AND h.status = 'active' AND h.hostname = $2
         LIMIT 1`,
        [input.context.tenantId, host],
      );
      const row = result.rows[0];
      if (!row)
        throw new SystemDomainError(
          "NOT_FOUND",
          "site host does not match tenant context",
          404,
        );
      return mapSiteResolution(row);
    } finally {
      client.release();
    }
  }
}

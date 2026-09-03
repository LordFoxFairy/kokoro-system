import { randomUUID } from "node:crypto";
import type { TenantRequestContext } from "../../../domain/runtime-manifest/models/index.js";
import type { SitePolicy } from "../../../domain/system/models/index.js";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import { PostgresRepository, requireRow, utcTimestamp } from "./support.js";
import { mapPolicy } from "./mappers.js";
import type { Row } from "./support.js";
import {
  decodeInteger,
  decodeString,
} from "../../persistence/postgres/value-decoders.js";

export class PostgresPolicyRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }
  public async get(
    context: TenantRequestContext,
    siteId: string,
  ): Promise<SitePolicy | null> {
    return this.withTransaction(async (client) => {
      const result = await client.query<Row>(
        "SELECT id, tenant_id, site_id, version, status, default_locale, allowed_locales_json, allowed_products_json, public_manifest, updated_at FROM system_site_policy WHERE site_id = $1 AND tenant_id = $2 AND status = 'active' LIMIT 1",
        [siteId, context.tenantId],
      );
      return result.rows[0] ? mapPolicy(result.rows[0]) : null;
    });
  }
  public async put(
    context: TenantRequestContext,
    siteId: string,
    input: Omit<SitePolicy, "id" | "tenantId" | "siteId" | "updatedAt">,
  ): Promise<SitePolicy> {
    return this.withTransaction(async (client) => {
      const site = await client.query<Row>(
        "SELECT id FROM system_site WHERE id = $1 AND tenant_id = $2 LIMIT 1",
        [siteId, context.tenantId],
      );
      requireRow(site.rows[0], "site not found");
      const old = await client.query<Row>(
        "SELECT id, version FROM system_site_policy WHERE site_id = $1 AND tenant_id = $2 AND status = 'active' LIMIT 1 FOR UPDATE",
        [siteId, context.tenantId],
      );
      const oldRow = old.rows[0];
      const id = oldRow
        ? decodeString(oldRow.id, "system_site_policy.id")
        : randomUUID();
      const version = oldRow
        ? decodeInteger(oldRow.version, "system_site_policy.version") + 1
        : 1;
      const time = utcTimestamp();
      if (oldRow) {
        await client.query(
          "UPDATE system_site_policy SET version = $1, status = 'active', default_locale = $2, allowed_locales_json = $3, allowed_products_json = $4, public_manifest = $5, updated_at = $6 WHERE id = $7 AND tenant_id = $8 AND site_id = $9",
          [
            version,
            input.defaultLocale,
            JSON.stringify(input.allowedLocales),
            JSON.stringify(input.allowedProducts),
            input.publicManifest,
            time,
            id,
            context.tenantId,
            siteId,
          ],
        );
      } else
        await client.query(
          "INSERT INTO system_site_policy (id, tenant_id, site_id, version, status, default_locale, allowed_locales_json, allowed_products_json, public_manifest, updated_at) VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9)",
          [
            id,
            context.tenantId,
            siteId,
            version,
            input.defaultLocale,
            JSON.stringify(input.allowedLocales),
            JSON.stringify(input.allowedProducts),
            input.publicManifest,
            time,
          ],
        );
      return {
        ...input,
        id,
        tenantId: context.tenantId,
        siteId,
        version,
        updatedAt: time,
      };
    });
  }
}

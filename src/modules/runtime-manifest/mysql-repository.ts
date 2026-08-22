import type { SqlPool } from "../../infrastructure/mysql/client.js";
import type { RuntimeManifest, TenantRequestContext } from "./model.js";
import type { SystemRepository } from "./ports.js";
import { manifestDigest } from "./service.js";

type Row = Record<string, unknown>;
type Value = Readonly<{ id: string; moduleKey: string; configKey: string; scopeType: string; locale: string | null; value: unknown; configVersion: string; releaseId: string | null; digest: string }>;
export class MysqlSystemRepository implements SystemRepository {
  public constructor(private readonly pool: SqlPool) {}
  public async getManifest(input: Readonly<{ context: TenantRequestContext; productId: string; locale: string }>): Promise<RuntimeManifest> {
    const client = await this.pool.connect();
    try {
      const bindings = await client.query<Row>(`SELECT release_id FROM system_release_binding WHERE scope_type = 'tenant' AND scope_id = ? AND product_id = ? AND status = 'active' ORDER BY updated_at DESC, id DESC LIMIT 1`, [input.context.tenantId, input.productId]);
      const binding = bindings.rows[0];
      const releaseId = binding?.release_id === undefined ? null : String(binding.release_id);
      const records = await client.query<Row>(`SELECT id, module_key, scope_type, scope_id, product_id, locale, config_key, value_json, config_version, release_id, digest FROM system_config_record WHERE status = 'active' AND deleted_at IS NULL AND (release_id = ? OR release_id IS NULL) AND (tenant_id = ? OR tenant_id IS NULL) AND (locale = ? OR locale IS NULL) AND ((scope_type = 'surface' AND scope_id = ?) OR (scope_type = 'tenant' AND scope_id = ?) OR (scope_type = 'product' AND scope_id = ?) OR scope_type = 'global') ORDER BY module_key, config_key, id`, [releaseId, input.context.tenantId, input.locale, input.context.surfaceId, input.context.tenantId, input.productId]);
      const candidates: Value[] = records.rows.map((row) => ({ id: String(row.id), moduleKey: String(row.module_key), configKey: String(row.config_key), scopeType: String(row.scope_type), locale: row.locale === null ? null : String(row.locale), value: typeof row.value_json === "string" ? JSON.parse(row.value_json) as unknown : row.value_json, configVersion: String(row.config_version), releaseId: row.release_id === null ? null : String(row.release_id), digest: String(row.digest) }));
      const scopeRank = (value: Value): number => value.scopeType === "surface" ? 4 : value.scopeType === "tenant" ? 3 : value.scopeType === "product" ? 2 : 1;
      const selected = new Map<string, Value>();
      for (const value of candidates) {
        const current = selected.get(`${value.moduleKey}:${value.configKey}`);
        const rank = (candidate: Value): readonly [number, number, number, bigint, string] => [scopeRank(candidate), candidate.locale === input.locale ? 1 : 0, candidate.releaseId === releaseId ? 1 : 0, BigInt(candidate.configVersion), candidate.id];
        const left = rank(value); const right = current ? rank(current) : null;
        let preferred = current === undefined;
        if (right) {
          if (left[0] !== right[0]) preferred = left[0] > right[0];
          else if (left[1] !== right[1]) preferred = left[1] > right[1];
          else if (left[2] !== right[2]) preferred = left[2] > right[2];
          else if (left[3] !== right[3]) preferred = left[3] > right[3];
          else preferred = left[4] > right[4];
        }
        if (preferred) selected.set(`${value.moduleKey}:${value.configKey}`, value);
      }
      const values = [...selected.values()];
      const byModule = (module: string): unknown[] => values.filter((value) => value.moduleKey === module).map((value) => value.value);
      const result = { tenantId: input.context.tenantId, productId: input.productId, locale: input.locale, navigation: byModule("navigation"), localeNamespaces: byModule("localization"), theme: (byModule("theme")[0] ?? {}) as Record<string, unknown>, featureFlags: byModule("feature-flags"), references: values.filter((value) => ["capability-assignment", "commerce-assignment", "model-assignment"].includes(value.moduleKey)).map((value) => value.value), configVersion: values.map((value) => value.configVersion).sort().at(-1) ?? "0", releaseId, digest: "" };
      return { ...result, digest: manifestDigest(result) };
    } finally { client.release(); }
  }
}

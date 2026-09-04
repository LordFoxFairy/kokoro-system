import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import type {
  RuntimeManifest,
  TenantRequestContext,
} from "../../../domain/runtime-manifest/models/index.js";
import type { SystemRepository } from "../../../application/runtime-manifest/ports/index.js";
import { manifestDigest } from "../../../application/runtime-manifest/services/runtime-manifest.service.js";
import {
  decodeEnum,
  decodeIntegerString,
  decodeJson,
  decodeObject,
  decodeString,
} from "../../persistence/postgres/value-decoders.js";

type Row = Record<string, unknown>;
type Value = Readonly<{
  id: string;
  moduleKey: string;
  configKey: string;
  scopeType: "global" | "tenant" | "product" | "surface";
  locale: string | null;
  value: unknown;
  configVersion: string;
  releaseId: string | null;
  digest: string;
}>;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function resolveProductId(
  client: SqlClient,
  productId: string,
): Promise<string | null> {
  const result = uuidPattern.test(productId)
    ? await client.query<Row>(
        `SELECT id FROM system_product WHERE id = $1 AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
        [productId],
      )
    : await client.query<Row>(
        `SELECT id FROM system_product WHERE product_key = $1 AND status = 'active' AND deleted_at IS NULL ORDER BY updated_at DESC, id DESC LIMIT 1`,
        [productId],
      );
  const value = result.rows[0]?.id;
  return value === undefined || value === null
    ? null
    : decodeString(value, "system_product.id");
}

function emptyManifest(
  input: Readonly<{
    context: TenantRequestContext;
    productId: string;
    locale: string;
  }>,
): RuntimeManifest {
  const result = {
    tenantId: input.context.tenantId,
    productId: input.productId,
    locale: input.locale,
    navigation: [],
    localeNamespaces: [],
    theme: {},
    featureFlags: [],
    references: [],
    configVersion: "0",
    releaseId: null,
    digest: "",
  };
  return { ...result, digest: manifestDigest(result) };
}

export class PostgresSystemRepository implements SystemRepository {
  public constructor(private readonly pool: SqlPool) {}
  public async getManifestGeneration(tenantId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<Row>(
        "SELECT generation FROM system_runtime_manifest_generation WHERE tenant_id = $1 LIMIT 1",
        [tenantId],
      );
      const value = result.rows[0]?.generation;
      return value === undefined
        ? "0"
        : decodeIntegerString(
            value,
            "system_runtime_manifest_generation.generation",
          );
    } finally {
      client.release();
    }
  }
  public async getManifest(
    input: Readonly<{
      context: TenantRequestContext;
      productId: string;
      locale: string;
    }>,
  ): Promise<RuntimeManifest> {
    const client = await this.pool.connect();
    try {
      const productUuid = await resolveProductId(client, input.productId);
      if (productUuid === null) return emptyManifest(input);
      const bindings = await client.query<Row>(
        `SELECT binding.release_id FROM system_release_binding AS binding JOIN system_config_release AS release ON release.id = binding.release_id WHERE binding.scope_type = 'tenant' AND binding.scope_id = $1 AND binding.product_id = $2 AND binding.status = 'active' AND release.tenant_id = $1 AND release.status = 'published' ORDER BY binding.updated_at DESC, binding.id DESC LIMIT 1`,
        [input.context.tenantId, productUuid],
      );
      const binding = bindings.rows[0];
      const releaseId = binding
        ? decodeString(binding.release_id, "system_release_binding.release_id")
        : null;
      const records = await client.query<Row>(
        `SELECT id, module_key, scope_type, scope_id, product_id, locale, config_key, value_json, config_version, release_id, digest FROM system_config_record WHERE status = 'active' AND deleted_at IS NULL AND (release_id = $1 OR release_id IS NULL) AND (tenant_id = $2 OR tenant_id IS NULL) AND (locale = $3 OR locale IS NULL) AND (product_id = $4 OR product_id IS NULL) AND ((scope_type = 'surface' AND scope_id = $5) OR (scope_type = 'tenant' AND scope_id = $6) OR (scope_type = 'product' AND scope_id = $7) OR scope_type = 'global') ORDER BY module_key, config_key, id`,
        [
          releaseId,
          input.context.tenantId,
          input.locale,
          productUuid,
          input.context.surfaceId,
          input.context.tenantId,
          productUuid,
        ],
      );
      const candidates: Value[] = records.rows.map((row) => ({
        id: decodeString(row.id, "system_config_record.id"),
        moduleKey: decodeString(
          row.module_key,
          "system_config_record.module_key",
        ),
        configKey: decodeString(
          row.config_key,
          "system_config_record.config_key",
        ),
        scopeType: decodeEnum(
          row.scope_type,
          "system_config_record.scope_type",
          ["global", "tenant", "product", "surface"],
        ),
        locale:
          row.locale === null
            ? null
            : decodeString(row.locale, "system_config_record.locale"),
        value: decodeJson(row.value_json, "system_config_record.value_json"),
        configVersion: decodeIntegerString(
          row.config_version,
          "system_config_record.config_version",
        ),
        releaseId:
          row.release_id === null
            ? null
            : decodeString(
                row.release_id,
                "system_config_record.release_id",
              ),
        digest: decodeString(row.digest, "system_config_record.digest"),
      }));
      const scopeRank = (value: Value): number =>
        value.scopeType === "surface"
          ? 4
          : value.scopeType === "tenant"
            ? 3
            : value.scopeType === "product"
              ? 2
              : 1;
      const selected = new Map<string, Value>();
      for (const value of candidates) {
        const current = selected.get(`${value.moduleKey}:${value.configKey}`);
        const rank = (
          candidate: Value,
        ): readonly [number, number, number, bigint, string] => [
          scopeRank(candidate),
          candidate.locale === input.locale ? 1 : 0,
          candidate.releaseId === releaseId ? 1 : 0,
          BigInt(candidate.configVersion),
          candidate.id,
        ];
        const left = rank(value);
        const right = current ? rank(current) : null;
        let preferred = current === undefined;
        if (right) {
          if (left[0] !== right[0]) preferred = left[0] > right[0];
          else if (left[1] !== right[1]) preferred = left[1] > right[1];
          else if (left[2] !== right[2]) preferred = left[2] > right[2];
          else if (left[3] !== right[3]) preferred = left[3] > right[3];
          else preferred = left[4] > right[4];
        }
        if (preferred)
          selected.set(`${value.moduleKey}:${value.configKey}`, value);
      }
      const values = [...selected.values()];
      const byModule = (module: string): unknown[] =>
        values
          .filter((value) => value.moduleKey === module)
          .map((value) => value.value);
      const result = {
        tenantId: input.context.tenantId,
        productId: input.productId,
        locale: input.locale,
        navigation: byModule("navigation"),
        localeNamespaces: byModule("localization"),
        theme: decodeObject(
          byModule("theme")[0] ?? {},
          "runtime_manifest.theme",
        ),
        featureFlags: byModule("feature-flags"),
        references: values
          .filter((value) =>
            [
              "capability-assignment",
              "commerce-assignment",
              "model-assignment",
            ].includes(value.moduleKey),
          )
          .map((value) => value.value),
        configVersion: values
          .reduce((maximum, value) => {
            const candidate = BigInt(value.configVersion);
            return candidate > maximum ? candidate : maximum;
          }, 0n)
          .toString(),
        releaseId,
        digest: "",
      };
      return { ...result, digest: manifestDigest(result) };
    } finally {
      client.release();
    }
  }
}

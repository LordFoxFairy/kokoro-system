import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import { SystemError } from "../../system.error.js";
import { configSchema } from "./schemas/config.schema.js";
import { presentationSchema } from "./schemas/presentation.schema.js";
@Injectable()
export class ProductProjectionRepository {
  public async product(tx: TransactionContext, key: string) {
    const result = await tx.query<{ id: string; product_key: string }>(
      "SELECT id,product_key FROM system_product WHERE (id::text=$1 OR product_key=$1) AND deleted_at IS NULL AND status='active'",
      [key],
    );
    if (result.rows.length !== 1)
      throw new SystemError("NOT_FOUND", "Product not found");
    return result.rows[0]!;
  }
  public async binding(
    tx: TransactionContext,
    tenant: string,
    site: string,
    product: string,
    surface: string | null,
  ) {
    const result = await tx.query<{ release_id: string }>(
      "SELECT b.release_id FROM system_release_binding b JOIN system_config_release r ON r.id=b.release_id AND r.tenant_id=b.tenant_id WHERE b.tenant_id=$1 AND b.product_id=$3 AND b.status='active' AND r.status='published' AND ((b.scope_type='surface' AND b.site_id=$2 AND b.scope_id=$4) OR (b.scope_type='product' AND b.scope_id=$3::text) OR (b.scope_type='tenant' AND b.scope_id=$1)) ORDER BY CASE b.scope_type WHEN 'surface' THEN 3 WHEN 'product' THEN 2 ELSE 1 END DESC,b.id LIMIT 1",
      [tenant, site, product, surface],
    );
    return result.rows[0]?.release_id ?? null;
  }
  public async configs(
    tx: TransactionContext,
    tenant: string,
    site: string,
    product: string,
    locale: string,
    surface: string | null,
    release: string | null,
  ) {
    const result = await tx.query(
      "SELECT id,tenant_id,site_id,module_key,scope_type,scope_id,product_id,locale,config_key,schema_version,value_json AS value,status,config_version,release_id,digest,updated_at FROM system_config_record WHERE status='active' AND (locale IS NULL OR locale=$4) AND (product_id IS NULL OR product_id=$3) AND ((scope_type='global' AND tenant_id IS NULL) OR (tenant_id=$1 AND ((scope_type='tenant' AND scope_id=$1) OR (scope_type='product' AND scope_id=$3::text) OR (scope_type='surface' AND site_id=$2 AND scope_id=$5)))) AND (release_id IS NULL OR release_id=$6) ORDER BY CASE scope_type WHEN 'global' THEN 0 WHEN 'tenant' THEN 1 WHEN 'product' THEN 2 ELSE 3 END,CASE WHEN product_id IS NULL THEN 0 ELSE 1 END,CASE WHEN locale IS NULL THEN 0 ELSE 1 END,CASE WHEN release_id IS NULL THEN 0 ELSE 1 END,config_version,config_key,id",
      [tenant, site, product, locale, surface, release],
    );
    return result.rows.map((row) => decodeRow(configSchema, row));
  }
  public async presentations(
    tx: TransactionContext,
    tenant: string,
    site: string,
    product: string,
    locale: string,
    surface: string | null,
  ) {
    const result = await tx.query(
      "SELECT p.id,p.tenant_id,p.application_id,p.locale,p.surface_id,p.schema_version,p.navigation,p.theme,p.locale_namespaces,p.version,p.created_at,p.updated_at FROM system_presentation p JOIN system_application a ON a.id=p.application_id AND a.tenant_id=p.tenant_id WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.product_id=$3 AND a.deleted_at IS NULL AND p.locale=$4 AND (p.surface_id IS NULL OR p.surface_id=$5) ORDER BY a.app_key,CASE WHEN p.surface_id IS NULL THEN 0 ELSE 1 END,p.id",
      [tenant, site, product, locale, surface],
    );
    return result.rows.map((row) => decodeRow(presentationSchema, row));
  }
  public async enabledFeatures(
    tx: TransactionContext,
    tenant: string,
    site: string,
    product: string,
  ) {
    const result = await tx.query<{ key: string }>(
      "SELECT DISTINCT f.global_feature_key AS key FROM system_app_feature_exposure e JOIN system_application a ON a.id=e.application_id AND a.tenant_id=e.tenant_id JOIN system_feature_definition f ON f.id=e.feature_id AND f.product_id=a.product_id WHERE a.tenant_id=$1 AND a.site_id=$2 AND a.product_id=$3 AND a.deleted_at IS NULL AND e.enabled AND f.retired_at IS NULL ORDER BY key",
      [tenant, site, product],
    );
    return result.rows.map((row) => row.key);
  }
}

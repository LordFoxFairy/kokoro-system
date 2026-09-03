import type {
  ConfigRelease,
  Site,
  SitePolicy,
  SiteResolution,
  SystemConfig,
  Workspace,
} from "../../../domain/system/models/index.js";
import type { Row } from "./support.js";
import {
  decodeBoolean,
  decodeEnum,
  decodeInteger,
  decodeJson,
  decodeNullableString,
  decodeString,
  decodeStringArray,
  decodeTimestamp,
} from "../../persistence/postgres/value-decoders.js";

export function mapSite(row: Row): Site {
  return {
    id: decodeString(row.id, "system_site.id"),
    tenantId: decodeString(row.tenant_id, "system_site.tenant_id"),
    siteKey: decodeString(row.site_key, "system_site.site_key"),
    hostnames: decodeStringArray(row.hostnames_json, "system_site.hostnames"),
    displayName: decodeString(row.display_name, "system_site.display_name"),
    status: decodeEnum(row.status, "system_site.status", [
      "draft",
      "active",
      "suspended",
      "archived",
    ]),
    version: decodeInteger(row.version, "system_site.version"),
    createdAt: decodeTimestamp(row.created_at, "system_site.created_at"),
    updatedAt: decodeTimestamp(row.updated_at, "system_site.updated_at"),
  };
}
export function mapSiteResolution(row: Row): SiteResolution {
  return {
    siteId: decodeString(row.id, "system_site.id"),
    key: decodeString(row.site_key, "system_site.site_key"),
    canonicalHost: decodeString(row.hostname, "system_site_host.hostname"),
    defaultLocale: decodeString(
      row.default_locale,
      "system_site_policy.default_locale",
    ),
    timezone: decodeString(row.timezone, "system_site.timezone"),
    generation: decodeInteger(row.version, "system_site.version"),
  };
}
export function mapWorkspace(row: Row): Workspace {
  return {
    id: decodeString(row.id, "system_workspace.id"),
    tenantId: decodeString(row.tenant_id, "system_workspace.tenant_id"),
    siteId: decodeString(row.site_id, "system_workspace.site_id"),
    workspaceKey: decodeString(
      row.workspace_key,
      "system_workspace.workspace_key",
    ),
    name: decodeString(row.name, "system_workspace.name"),
    status: decodeEnum(row.status, "system_workspace.status", [
      "active",
      "archived",
    ]),
    version: decodeInteger(row.version, "system_workspace.version"),
    createdAt: decodeTimestamp(row.created_at, "system_workspace.created_at"),
    updatedAt: decodeTimestamp(row.updated_at, "system_workspace.updated_at"),
  };
}
export function mapPolicy(row: Row): SitePolicy {
  return {
    id: decodeString(row.id, "system_site_policy.id"),
    tenantId: decodeString(row.tenant_id, "system_site_policy.tenant_id"),
    siteId: decodeString(row.site_id, "system_site_policy.site_id"),
    version: decodeInteger(row.version, "system_site_policy.version"),
    status: decodeEnum(row.status, "system_site_policy.status", [
      "active",
      "archived",
    ]),
    defaultLocale: decodeString(
      row.default_locale,
      "system_site_policy.default_locale",
    ),
    allowedLocales: decodeStringArray(
      row.allowed_locales_json,
      "system_site_policy.allowed_locales_json",
    ),
    allowedProducts: decodeStringArray(
      row.allowed_products_json,
      "system_site_policy.allowed_products_json",
    ),
    publicManifest: decodeBoolean(
      row.public_manifest,
      "system_site_policy.public_manifest",
    ),
    updatedAt: decodeTimestamp(
      row.updated_at,
      "system_site_policy.updated_at",
    ),
  };
}
export function mapConfig(row: Row): SystemConfig {
  return {
    id: decodeString(row.id, "system_config_record.id"),
    tenantId: decodeNullableString(
      row.tenant_id,
      "system_config_record.tenant_id",
    ),
    moduleKey: decodeString(
      row.module_key,
      "system_config_record.module_key",
    ),
    configKey: decodeString(
      row.config_key,
      "system_config_record.config_key",
    ),
    scopeType: decodeEnum(row.scope_type, "system_config_record.scope_type", [
      "global",
      "tenant",
      "product",
      "surface",
    ]),
    scopeId: decodeNullableString(
      row.scope_id,
      "system_config_record.scope_id",
    ),
    productId: decodeNullableString(
      row.product_id,
      "system_config_record.product_id",
    ),
    locale: decodeNullableString(
      row.locale,
      "system_config_record.locale",
    ),
    value: decodeJson(row.value_json, "system_config_record.value_json"),
    schemaVersion: decodeInteger(
      row.schema_version,
      "system_config_record.schema_version",
    ),
    status: decodeEnum(row.status, "system_config_record.status", [
      "active",
      "deleted",
    ]),
    configVersion: decodeInteger(
      row.config_version,
      "system_config_record.config_version",
    ),
    releaseId: decodeNullableString(
      row.release_id,
      "system_config_record.release_id",
    ),
    digest: decodeString(row.digest, "system_config_record.digest"),
    updatedAt: decodeTimestamp(
      row.updated_at,
      "system_config_record.updated_at",
    ),
  };
}
export function mapRelease(row: Row): ConfigRelease {
  return {
    id: decodeString(row.id, "system_config_release.id"),
    tenantId: decodeString(row.tenant_id, "system_config_release.tenant_id"),
    releaseKey: decodeString(
      row.release_key,
      "system_config_release.release_key",
    ),
    status: decodeEnum(row.status, "system_config_release.status", [
      "draft",
      "validated",
      "published",
      "retired",
    ]),
    digest: decodeString(row.digest, "system_config_release.digest"),
    publishedAt:
      row.published_at === null
        ? null
        : decodeTimestamp(
            row.published_at,
            "system_config_release.published_at",
          ),
    version: decodeInteger(row.version, "system_config_release.version"),
    createdAt: decodeTimestamp(
      row.created_at,
      "system_config_release.created_at",
    ),
    updatedAt: decodeTimestamp(
      row.updated_at,
      "system_config_release.updated_at",
    ),
  };
}

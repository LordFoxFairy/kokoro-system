import type { Page } from "../../application/system/dto/index.js";
import type { RuntimeManifest } from "../../domain/runtime-manifest/models/index.js";
import type {
  ConfigRelease,
  Site,
  SitePolicy,
  SystemConfig,
  Workspace,
} from "../../domain/system/models/index.js";

export function runtimeManifestToWire(value: RuntimeManifest) {
  return {
    tenant_id: value.tenantId,
    product_id: value.productId,
    locale: value.locale,
    navigation: value.navigation,
    locale_namespaces: value.localeNamespaces,
    theme: value.theme,
    feature_flags: value.featureFlags,
    references: value.references,
    config_version: value.configVersion,
    release_id: value.releaseId,
    digest: value.digest,
  };
}

export function siteToWire(value: Site) {
  return {
    id: value.id,
    tenant_id: value.tenantId,
    site_key: value.siteKey,
    hostnames: value.hostnames,
    display_name: value.displayName,
    status: value.status,
    version: value.version,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function workspaceToWire(value: Workspace) {
  return {
    id: value.id,
    tenant_id: value.tenantId,
    site_id: value.siteId,
    workspace_key: value.workspaceKey,
    name: value.name,
    status: value.status,
    version: value.version,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function sitePolicyToWire(value: SitePolicy) {
  return {
    id: value.id,
    tenant_id: value.tenantId,
    site_id: value.siteId,
    version: value.version,
    status: value.status,
    default_locale: value.defaultLocale,
    allowed_locales: value.allowedLocales,
    allowed_products: value.allowedProducts,
    public_manifest: value.publicManifest,
    updated_at: value.updatedAt,
  };
}

export function releaseToWire(value: ConfigRelease) {
  return {
    id: value.id,
    tenant_id: value.tenantId,
    release_key: value.releaseKey,
    status: value.status,
    digest: value.digest,
    published_at: value.publishedAt,
    version: value.version,
    created_at: value.createdAt,
    updated_at: value.updatedAt,
  };
}

export function configToWire(value: SystemConfig) {
  return {
    id: value.id,
    tenant_id: value.tenantId,
    module_key: value.moduleKey,
    config_key: value.configKey,
    scope_type: value.scopeType,
    scope_id: value.scopeId,
    product_id: value.productId,
    locale: value.locale,
    value: value.value,
    schema_version: value.schemaVersion,
    status: value.status,
    config_version: value.configVersion,
    release_id: value.releaseId,
    digest: value.digest,
    updated_at: value.updatedAt,
  };
}

export function pageToWire<T, Wire>(
  page: Page<T>,
  mapItem: (value: T) => Wire,
) {
  return {
    items: page.items.map(mapItem),
    next_cursor: page.nextCursor,
  };
}

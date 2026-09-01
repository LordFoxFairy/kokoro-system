-- kokoro-system V1. PostgreSQL 16+ / UTC timestamptz / Redis is not a data store.
-- This migration intentionally has no cross-service relational constraints or business unique indexes.
CREATE TABLE IF NOT EXISTS system_product (
  id UUID PRIMARY KEY, product_key VARCHAR(128) NOT NULL, name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL, deleted_at TIMESTAMPTZ(6), deleted_by UUID, delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_product_status_idx ON system_product (status, id);

CREATE TABLE IF NOT EXISTS system_product_profile (
  id UUID PRIMARY KEY, product_id UUID NOT NULL, profile_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL, config_version BIGINT NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ(6),
  deleted_by UUID, delete_reason VARCHAR(500), created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_profile_product_idx ON system_product_profile (product_id, status, id);

CREATE TABLE IF NOT EXISTS system_config_release (
  id UUID PRIMARY KEY, tenant_id UUID, release_key VARCHAR(128) NOT NULL, status VARCHAR(32) NOT NULL,
  digest CHAR(64) NOT NULL, published_at TIMESTAMPTZ(6), version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_release_status_idx ON system_config_release (tenant_id, status, id);

CREATE TABLE IF NOT EXISTS system_release_binding (
  id UUID PRIMARY KEY, scope_type VARCHAR(32) NOT NULL, scope_id UUID, product_id UUID, release_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_binding_scope_idx ON system_release_binding (scope_type, scope_id, product_id, status, id);

CREATE TABLE IF NOT EXISTS system_config_record (
  id UUID PRIMARY KEY, tenant_id UUID, module_key VARCHAR(64) NOT NULL, scope_type VARCHAR(32) NOT NULL,
  scope_id UUID, product_id UUID, locale VARCHAR(32), config_key VARCHAR(160) NOT NULL, schema_version INT NOT NULL,
  value_json JSONB NOT NULL, status VARCHAR(32) NOT NULL, config_version BIGINT NOT NULL DEFAULT 1,
  release_id UUID, digest CHAR(64) NOT NULL, updated_by UUID, deleted_at TIMESTAMPTZ(6), deleted_by UUID,
  delete_reason VARCHAR(500), created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_config_lookup_idx ON system_config_record (tenant_id, locale, module_key, scope_type, scope_id, product_id, status, id);
CREATE INDEX IF NOT EXISTS system_config_release_idx ON system_config_record (release_id, status, id);

CREATE TABLE IF NOT EXISTS system_audit_event (
  id UUID PRIMARY KEY, tenant_id UUID, actor_id UUID, command_id UUID, kind VARCHAR(128) NOT NULL,
  payload_json JSONB NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_audit_tenant_time_idx ON system_audit_event (tenant_id, created_at, id);
CREATE INDEX IF NOT EXISTS system_audit_command_idx ON system_audit_event (command_id, id);

CREATE TABLE IF NOT EXISTS system_site (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, site_key VARCHAR(128) NOT NULL,
  hostnames_json JSONB NOT NULL, display_name VARCHAR(160) NOT NULL, status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL,
  deleted_at TIMESTAMPTZ(6), deleted_by UUID
);
CREATE INDEX IF NOT EXISTS system_site_tenant_idx ON system_site (tenant_id, status, id);

CREATE TABLE IF NOT EXISTS system_workspace (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, site_id UUID NOT NULL, workspace_key VARCHAR(128) NOT NULL,
  name VARCHAR(160) NOT NULL, status VARCHAR(32) NOT NULL, version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL, deleted_at TIMESTAMPTZ(6), deleted_by UUID
);
CREATE INDEX IF NOT EXISTS system_workspace_tenant_idx ON system_workspace (tenant_id, site_id, status, id);

CREATE TABLE IF NOT EXISTS system_site_policy (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, site_id UUID NOT NULL, version BIGINT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL, default_locale VARCHAR(32) NOT NULL, allowed_locales_json JSONB NOT NULL,
  allowed_products_json JSONB NOT NULL, public_manifest BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_site_policy_tenant_idx ON system_site_policy (tenant_id, site_id, status, id);

CREATE TABLE IF NOT EXISTS system_command_receipt (
  id UUID PRIMARY KEY, tenant_id UUID NOT NULL, idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_json JSONB NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS system_receipt_lookup_idx ON system_command_receipt (tenant_id, idempotency_key, created_at, id);

-- kokoro-system V1 canonical schema.
-- PostgreSQL 16+. Persist instants as UTC-aware TIMESTAMPTZ(3); Redis is a cache only.
-- Cross-repository relationships are application-owned and are not database constraints.

CREATE TABLE IF NOT EXISTS system_product (
  id UUID PRIMARY KEY,
  product_key VARCHAR(128) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL,
  deleted_at TIMESTAMPTZ(3),
  deleted_by UUID,
  delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_product_status CHECK (status IN ('active', 'archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_product_key_active
  ON system_product (product_key) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_system_product_status ON system_product (status, id);

CREATE TABLE IF NOT EXISTS system_product_profile (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  profile_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  config_version BIGINT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ(3),
  deleted_by UUID,
  delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_product_profile_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_product_profile_version CHECK (config_version > 0)
);
CREATE INDEX IF NOT EXISTS ix_system_product_profile_product ON system_product_profile (product_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_product_profile_key_active
  ON system_product_profile (product_id, profile_key) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS system_config_release (
  id UUID PRIMARY KEY,
  tenant_id TEXT,
  release_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL,
  digest CHAR(64) NOT NULL,
  published_at TIMESTAMPTZ(3),
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_config_release_status CHECK (status IN ('draft', 'validated', 'published', 'retired')),
  CONSTRAINT ck_system_config_release_version CHECK (version > 0),
  CONSTRAINT ck_system_config_release_digest CHECK (digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS ix_system_config_release_tenant_status ON system_config_release (tenant_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_config_release_tenant_key
  ON system_config_release (COALESCE(tenant_id, ''), release_key) WHERE status <> 'retired';

CREATE TABLE IF NOT EXISTS system_runtime_manifest_generation (
  tenant_id TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_runtime_manifest_generation_positive CHECK (generation > 0)
);

CREATE TABLE IF NOT EXISTS system_release_binding (
  id UUID PRIMARY KEY,
  scope_type VARCHAR(32) NOT NULL,
  scope_id TEXT,
  product_id UUID,
  release_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_release_binding_scope CHECK (scope_type IN ('global', 'tenant', 'product', 'surface')),
  CONSTRAINT ck_system_release_binding_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_release_binding_scope_id CHECK (scope_type = 'global' OR scope_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_system_release_binding_scope ON system_release_binding (scope_type, scope_id, product_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_release_binding_active
  ON system_release_binding (scope_type, COALESCE(scope_id, ''), COALESCE(product_id::text, '')) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS system_config_record (
  id UUID PRIMARY KEY,
  tenant_id TEXT,
  module_key VARCHAR(64) NOT NULL,
  scope_type VARCHAR(32) NOT NULL,
  scope_id TEXT,
  product_id UUID,
  locale VARCHAR(32),
  config_key VARCHAR(160) NOT NULL,
  schema_version INT NOT NULL,
  value_json JSONB NOT NULL,
  status VARCHAR(32) NOT NULL,
  config_version BIGINT NOT NULL DEFAULT 1,
  release_id UUID,
  digest CHAR(64) NOT NULL,
  updated_by UUID,
  deleted_at TIMESTAMPTZ(3),
  deleted_by UUID,
  delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_config_record_scope CHECK (scope_type IN ('global', 'tenant', 'product', 'surface')),
  CONSTRAINT ck_system_config_record_status CHECK (status IN ('active', 'deleted')),
  CONSTRAINT ck_system_config_record_schema_version CHECK (schema_version > 0),
  CONSTRAINT ck_system_config_record_config_version CHECK (config_version > 0),
  CONSTRAINT ck_system_config_record_digest CHECK (digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS ix_system_config_record_lookup ON system_config_record (tenant_id, locale, module_key, scope_type, scope_id, product_id, status, id);
CREATE INDEX IF NOT EXISTS ix_system_config_record_release ON system_config_record (release_id, status, id);

CREATE TABLE IF NOT EXISTS system_audit_event (
  id UUID PRIMARY KEY,
  tenant_id TEXT,
  actor_id UUID,
  command_id UUID,
  kind VARCHAR(128) NOT NULL,
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS ix_system_audit_event_tenant_time ON system_audit_event (tenant_id, created_at, id);
CREATE INDEX IF NOT EXISTS ix_system_audit_event_command ON system_audit_event (command_id, id);

CREATE TABLE IF NOT EXISTS system_site (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by UUID,
  CONSTRAINT ck_system_site_status CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  CONSTRAINT ck_system_site_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_system_site_tenant_status ON system_site (tenant_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_site_tenant_key_active
  ON system_site (tenant_id, site_key) WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS system_site_host (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_site_host_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_site_host_hostname CHECK (hostname = lower(hostname) AND hostname <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_site_host_active_hostname
  ON system_site_host (hostname) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_site_host_site_hostname
  ON system_site_host (tenant_id, site_id, hostname);
CREATE INDEX IF NOT EXISTS ix_system_site_host_tenant_status ON system_site_host (tenant_id, status, hostname, site_id);

CREATE TABLE IF NOT EXISTS system_workspace (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  workspace_key VARCHAR(128) NOT NULL,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by UUID,
  CONSTRAINT ck_system_workspace_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_workspace_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_system_workspace_tenant_site_status ON system_workspace (tenant_id, site_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_workspace_tenant_site_key_active
  ON system_workspace (tenant_id, site_id, workspace_key) WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS system_site_policy (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL,
  default_locale VARCHAR(32) NOT NULL,
  allowed_locales_json JSONB NOT NULL,
  allowed_products_json JSONB NOT NULL,
  public_manifest BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_site_policy_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_site_policy_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_system_site_policy_tenant_status ON system_site_policy (tenant_id, site_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_site_policy_active
  ON system_site_policy (tenant_id, site_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS system_command_receipt (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  response_json JSONB,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMPTZ(3),
  CONSTRAINT ck_system_command_receipt_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_system_command_receipt_status CHECK (status IN ('pending', 'completed')),
  CONSTRAINT ck_system_command_receipt_completion CHECK (
    (status = 'pending' AND response_json IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND response_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_command_receipt_tenant_key
  ON system_command_receipt (tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS ix_system_command_receipt_created ON system_command_receipt (tenant_id, created_at, id);

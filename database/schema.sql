-- kokoro-system V1 canonical schema.
-- PostgreSQL 16+. Persist instants as UTC-aware TIMESTAMPTZ(3); Redis is a cache only.
-- Cross-repository relationships are application-owned and are not database constraints.

CREATE TABLE IF NOT EXISTS system_product (
  id UUID PRIMARY KEY,
  product_key VARCHAR(128) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL,
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_product_version CHECK (version > 0),
  CONSTRAINT ck_system_product_status CHECK (status IN ('active', 'archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_product_key_active
  ON system_product (product_key);
CREATE INDEX IF NOT EXISTS ix_system_product_status ON system_product (status, id);

CREATE TABLE IF NOT EXISTS system_config_release (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
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
  ON system_config_release (tenant_id, release_key) WHERE status <> 'retired';

CREATE TABLE IF NOT EXISTS system_runtime_manifest_generation (
  tenant_id TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_runtime_manifest_generation_positive CHECK (generation > 0)
);

CREATE TABLE IF NOT EXISTS system_release_binding (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id UUID,
  version BIGINT NOT NULL DEFAULT 1,
  scope_type VARCHAR(32) NOT NULL,
  scope_id TEXT,
  product_id UUID,
  release_id UUID NOT NULL,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_release_binding_version CHECK (version > 0),
  CONSTRAINT ck_system_release_binding_scope CHECK (scope_type IN ('tenant', 'product', 'surface')),
  CONSTRAINT ck_system_release_binding_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT ck_system_release_binding_scope_id CHECK (
    product_id IS NOT NULL AND scope_id IS NOT NULL AND (
      (scope_type = 'tenant' AND scope_id = tenant_id AND site_id IS NULL)
      OR (scope_type = 'product' AND scope_id = product_id::text AND site_id IS NULL)
      OR (scope_type = 'surface' AND scope_id <> '' AND site_id IS NOT NULL)
    )
  )
);
CREATE INDEX IF NOT EXISTS ix_system_release_binding_scope ON system_release_binding (scope_type, scope_id, product_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_release_binding_active
  ON system_release_binding (tenant_id, COALESCE(site_id::text, ''), scope_type, COALESCE(scope_id, ''), COALESCE(product_id::text, '')) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS system_config_record (
  id UUID PRIMARY KEY,
  site_id UUID,
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
  updated_by TEXT,
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  delete_reason VARCHAR(500),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_config_record_scope CHECK (scope_type IN ('global', 'tenant', 'product', 'surface')),
  CONSTRAINT ck_system_config_scope_fields CHECK (
    (scope_type = 'global' AND tenant_id IS NULL AND scope_id IS NULL AND site_id IS NULL AND release_id IS NULL)
    OR (scope_type = 'tenant' AND tenant_id IS NOT NULL AND scope_id IS NOT NULL AND scope_id = tenant_id AND product_id IS NULL AND site_id IS NULL)
    OR (scope_type = 'product' AND tenant_id IS NOT NULL AND product_id IS NOT NULL AND scope_id IS NOT NULL AND scope_id = product_id::text AND site_id IS NULL)
    OR (scope_type = 'surface' AND tenant_id IS NOT NULL AND product_id IS NOT NULL AND site_id IS NOT NULL AND scope_id IS NOT NULL AND scope_id <> '')
  ),
  CONSTRAINT ck_system_config_record_status CHECK (status IN ('active', 'deleted')),
  CONSTRAINT ck_system_config_record_schema_version CHECK (schema_version > 0),
  CONSTRAINT ck_system_config_record_config_version CHECK (config_version > 0),
  CONSTRAINT ck_system_config_record_digest CHECK (digest ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS ix_system_config_record_lookup ON system_config_record (tenant_id, locale, module_key, scope_type, scope_id, product_id, status, id);
CREATE INDEX IF NOT EXISTS ix_system_config_record_release ON system_config_record (release_id, status, id);

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
  deleted_by TEXT,
  CONSTRAINT ck_system_site_status CHECK (status IN ('draft', 'active', 'suspended', 'archived')),
  CONSTRAINT ck_system_site_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_system_site_tenant_status ON system_site (tenant_id, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_site_tenant_key_active
  ON system_site (tenant_id, site_key) WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS system_site_host (
  id UUID PRIMARY KEY,
  version BIGINT NOT NULL DEFAULT 1,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  hostname VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_site_host_version CHECK (version > 0),
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
  deleted_by TEXT,
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
  scope_kind TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  response_json JSONB,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMPTZ(3),
  expires_at TIMESTAMPTZ(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL '7 days'),
  CONSTRAINT ck_system_receipt_scope CHECK ((scope_kind = 'global' AND scope_id = '') OR (scope_kind = 'tenant' AND scope_id <> '')),
  CONSTRAINT ck_system_command_receipt_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_system_command_receipt_status CHECK (status IN ('pending', 'completed')),
  CONSTRAINT ck_system_command_receipt_completion CHECK (
    (status = 'pending' AND response_json IS NULL AND completed_at IS NULL)
    OR (status = 'completed' AND response_json IS NOT NULL AND completed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_command_receipt_scope_key
  ON system_command_receipt (scope_kind, scope_id, idempotency_key);
CREATE INDEX IF NOT EXISTS ix_system_command_receipt_created ON system_command_receipt (scope_kind, scope_id, created_at, id);

-- Config identity includes release and Site; no cross-site last-writer-wins.
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_config_record_identity
  ON system_config_record (COALESCE(tenant_id, ''), COALESCE(site_id::text, ''), module_key, config_key,
    scope_type, COALESCE(scope_id, ''), COALESCE(product_id::text, ''), COALESCE(locale, ''), COALESCE(release_id::text, ''))
  WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS ix_system_binding_tenant_release ON system_release_binding (tenant_id, release_id, status);
CREATE INDEX IF NOT EXISTS ix_system_receipt_expiry ON system_command_receipt (expires_at, id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS ix_system_site_page ON system_site (tenant_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_workspace_page ON system_workspace (tenant_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_product_page ON system_product (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_release_page ON system_config_release (tenant_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS system_catalog_generation (
  scope TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_catalog_scope CHECK (scope = 'catalog'),
  CONSTRAINT ck_system_catalog_generation CHECK (generation > 0)
);
INSERT INTO system_catalog_generation (scope) VALUES ('catalog');

CREATE TABLE IF NOT EXISTS system_application (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  site_id UUID NOT NULL,
  product_id UUID NOT NULL,
  app_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  CONSTRAINT ck_system_application_version CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_application_key ON system_application (tenant_id, site_id, app_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_application_page ON system_application (tenant_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_application_site ON system_application (tenant_id, site_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_application_product ON system_application (product_id, id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS system_feature_definition (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL,
  global_feature_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  result_contract JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  retired_at TIMESTAMPTZ(3),
  CONSTRAINT uq_system_feature_key UNIQUE (global_feature_key),
  CONSTRAINT ck_system_feature_version CHECK (version > 0),
  CONSTRAINT ck_system_feature_contract CHECK (schema_version = 1 AND jsonb_typeof(result_contract) = 'object' AND octet_length(result_contract::text) <= 32768)
);
CREATE INDEX IF NOT EXISTS ix_system_feature_product ON system_feature_definition (product_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_system_feature_page ON system_feature_definition (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS system_app_feature_exposure (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  application_id UUID NOT NULL,
  feature_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_system_exposure_identity UNIQUE (tenant_id, application_id, feature_id),
  CONSTRAINT ck_system_exposure_version CHECK (version > 0),
  CONSTRAINT ck_system_exposure_order CHECK (display_order >= 0)
);
CREATE INDEX IF NOT EXISTS ix_system_exposure_feature ON system_app_feature_exposure (feature_id, id);
CREATE INDEX IF NOT EXISTS ix_system_exposure_page ON system_app_feature_exposure (tenant_id, application_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS system_presentation (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  application_id UUID NOT NULL,
  locale VARCHAR(32) NOT NULL,
  surface_id VARCHAR(160),
  schema_version INTEGER NOT NULL DEFAULT 1,
  navigation JSONB NOT NULL,
  theme JSONB NOT NULL,
  locale_namespaces JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_system_presentation_version CHECK (version > 0),
  CONSTRAINT ck_system_presentation_schema CHECK (schema_version = 1 AND jsonb_typeof(navigation) = 'array' AND jsonb_typeof(theme) = 'object' AND jsonb_typeof(locale_namespaces) = 'array' AND octet_length(navigation::text || theme::text || locale_namespaces::text) <= 65536)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_presentation_identity ON system_presentation (tenant_id, application_id, locale, COALESCE(surface_id, ''));

CREATE TABLE IF NOT EXISTS model_definition (
  id UUID PRIMARY KEY,
  model_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  CONSTRAINT uq_model_definition_key UNIQUE (model_key),
  CONSTRAINT ck_model_definition_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_model_definition_page ON model_definition (created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS model_provider (
  id UUID PRIMARY KEY,
  provider VARCHAR(128) NOT NULL,
  provider_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  secret_handle_ref VARCHAR(255) NOT NULL,
  transport TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  CONSTRAINT uq_model_provider_key UNIQUE (provider, provider_key),
  CONSTRAINT ck_model_provider_transport CHECK (transport = 'litellm'),
  CONSTRAINT ck_model_provider_priority CHECK (priority >= 0),
  CONSTRAINT ck_model_provider_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_model_provider_page ON model_provider (created_at DESC, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS model_label (
  id UUID PRIMARY KEY,
  label_key VARCHAR(128) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  feature_key VARCHAR(128) NOT NULL,
  default_revision_id UUID,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMPTZ(3),
  deleted_by TEXT,
  CONSTRAINT uq_model_label_key UNIQUE (label_key),
  CONSTRAINT ck_model_label_version CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS ix_model_label_page ON model_label (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_model_label_feature ON model_label (feature_key, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_model_label_revision ON model_label (default_revision_id, id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS model_revision (
  id UUID PRIMARY KEY,
  model_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  revision INTEGER NOT NULL,
  provider_model_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  feature_key VARCHAR(128) NOT NULL,
  input_modalities JSONB NOT NULL,
  output_modalities JSONB NOT NULL,
  transport TEXT NOT NULL,
  gateway_model_name VARCHAR(255) NOT NULL,
  context_window INTEGER,
  priority INTEGER NOT NULL DEFAULT 100,
  digest CHAR(64) NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ(3),
  retired_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_model_revision_number UNIQUE (model_id, revision),
  CONSTRAINT ck_model_revision_version CHECK (version > 0 AND revision > 0),
  CONSTRAINT ck_model_revision_priority CHECK (priority >= 0),
  CONSTRAINT ck_model_revision_context CHECK (context_window IS NULL OR context_window > 0),
  CONSTRAINT ck_model_revision_transport CHECK (transport = 'litellm'),
  CONSTRAINT ck_model_revision_digest CHECK (digest ~ '^[a-f0-9]{64}$'),
  CONSTRAINT ck_model_revision_retirement CHECK (retired_at IS NULL OR published_at IS NOT NULL),
  CONSTRAINT ck_model_revision_modalities CHECK (jsonb_typeof(input_modalities) = 'array' AND jsonb_typeof(output_modalities) = 'array')
);
CREATE INDEX IF NOT EXISTS ix_model_revision_resolution ON model_revision (feature_key, priority, id) WHERE published_at IS NOT NULL AND retired_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_model_revision_provider ON model_revision (provider_id, id);
CREATE INDEX IF NOT EXISTS ix_model_revision_page ON model_revision (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS model_routing_policy (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  label_id UUID NOT NULL,
  feature_key VARCHAR(128) NOT NULL,
  model_revision_id UUID,
  visible BOOLEAN NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 100,
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT uq_model_routing_tenant_label UNIQUE (tenant_id, label_id),
  CONSTRAINT ck_model_routing_version CHECK (version > 0),
  CONSTRAINT ck_model_routing_priority CHECK (priority >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_model_routing_default ON model_routing_policy (tenant_id, feature_key) WHERE is_default;
CREATE INDEX IF NOT EXISTS ix_model_routing_revision ON model_routing_policy (model_revision_id, id);
CREATE INDEX IF NOT EXISTS ix_model_routing_page ON model_routing_policy (tenant_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS model_provider_health_state (
  provider_id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  observed_at TIMESTAMPTZ(3) NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_model_health_status CHECK (status IN ('unknown', 'healthy', 'degraded', 'down')),
  CONSTRAINT ck_model_health_generation CHECK (generation > 0)
);
CREATE TABLE IF NOT EXISTS model_cache_generation (
  scope TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT ck_model_cache_scope CHECK (scope = 'resolve'),
  CONSTRAINT ck_model_cache_generation CHECK (generation > 0)
);
INSERT INTO model_cache_generation (scope) VALUES ('resolve');

-- Technical immutable-snapshot integrity guard; no orchestration or hidden writes.
CREATE FUNCTION model_revision_immutable_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable model revision identity' USING ERRCODE = '23514';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.model_id IS DISTINCT FROM OLD.model_id OR NEW.revision IS DISTINCT FROM OLD.revision THEN
    RAISE EXCEPTION 'immutable model revision identity' USING ERRCODE = '23514';
  END IF;
  IF OLD.published_at IS NOT NULL AND (
    (to_jsonb(NEW) - ARRAY['retired_at','version','updated_at']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['retired_at','version','updated_at'])
  ) THEN
    RAISE EXCEPTION 'immutable published model revision' USING ERRCODE = '23514';
  END IF;
  IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION 'immutable model retirement' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_model_revision_immutable_guard BEFORE UPDATE OR DELETE ON model_revision
  FOR EACH ROW EXECUTE FUNCTION model_revision_immutable_guard();

CREATE FUNCTION system_feature_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable feature identity' USING ERRCODE = '23514';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['retired_at','version']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['retired_at','version']) THEN
    RAISE EXCEPTION 'immutable feature definition' USING ERRCODE = '23514';
  END IF;
  IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION 'immutable feature retirement' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_system_feature_identity_guard BEFORE UPDATE OR DELETE ON system_feature_definition
  FOR EACH ROW EXECUTE FUNCTION system_feature_identity_guard();

-- Owner maintenance scans: time predicates match bounded retention queries.
CREATE INDEX IF NOT EXISTS ix_system_site_retention ON system_site (deleted_at,id) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_system_workspace_retention ON system_workspace (deleted_at,site_id,id) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_system_application_retention ON system_application (deleted_at,site_id,product_id,id) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_system_host_retention ON system_site_host (updated_at,site_id,id) WHERE status='archived';
CREATE INDEX IF NOT EXISTS ix_system_config_retention ON system_config_record (deleted_at,site_id,product_id,id) WHERE deleted_at IS NOT NULL AND release_id IS NULL;
CREATE INDEX IF NOT EXISTS ix_system_binding_retention ON system_release_binding (updated_at,site_id,product_id,release_id,id) WHERE status='archived';
CREATE INDEX IF NOT EXISTS ix_system_release_retention ON system_config_release (updated_at,id) WHERE status='retired';
CREATE INDEX IF NOT EXISTS ix_model_provider_retention ON model_provider (deleted_at,id) WHERE deleted_at IS NOT NULL AND secret_handle_ref<>'';

-- kokoro-system V1. MySQL 8.4 / InnoDB / UTC / no FK / no business UNIQUE indexes.
CREATE TABLE IF NOT EXISTS system_product (
  id CHAR(36) NOT NULL PRIMARY KEY, product_key VARCHAR(128) NOT NULL, name VARCHAR(160) NOT NULL,
  status VARCHAR(32) NOT NULL, deleted_at DATETIME(6) NULL, deleted_by CHAR(36) NULL, delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
  INDEX system_product_status_idx (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS system_product_profile (
  id CHAR(36) NOT NULL PRIMARY KEY, product_id CHAR(36) NOT NULL, profile_key VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL, config_version BIGINT NOT NULL DEFAULT 1, deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL, delete_reason VARCHAR(500) NULL, created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
  INDEX system_profile_product_idx (product_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS system_config_release (
  id CHAR(36) NOT NULL PRIMARY KEY, release_key VARCHAR(128) NOT NULL, status VARCHAR(32) NOT NULL,
  digest CHAR(64) NOT NULL, published_at DATETIME(6) NULL, created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
  INDEX system_release_status_idx (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS system_release_binding (
  id CHAR(36) NOT NULL PRIMARY KEY, scope_type VARCHAR(32) NOT NULL, scope_id CHAR(36) NULL,
  product_id CHAR(36) NULL, release_id CHAR(36) NOT NULL, status VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
  INDEX system_binding_scope_idx (scope_type, scope_id, product_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS system_config_record (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NULL, module_key VARCHAR(64) NOT NULL, scope_type VARCHAR(32) NOT NULL,
  scope_id CHAR(36) NULL, product_id CHAR(36) NULL, locale VARCHAR(32) NULL, config_key VARCHAR(160) NOT NULL, schema_version INT NOT NULL,
  value_json JSON NOT NULL, status VARCHAR(32) NOT NULL, config_version BIGINT NOT NULL DEFAULT 1,
  release_id CHAR(36) NULL, digest CHAR(64) NOT NULL, updated_by CHAR(36) NULL,
  deleted_at DATETIME(6) NULL, deleted_by CHAR(36) NULL, delete_reason VARCHAR(500) NULL,
  created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL,
  INDEX system_config_lookup_idx (tenant_id, locale, module_key, scope_type, scope_id, product_id, status, id),
  INDEX system_config_release_idx (release_id, status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS system_audit_event (
  id CHAR(36) NOT NULL PRIMARY KEY, tenant_id CHAR(36) NULL, actor_id CHAR(36) NULL, command_id CHAR(36) NULL,
  kind VARCHAR(128) NOT NULL, payload_json JSON NOT NULL, created_at DATETIME(6) NOT NULL,
  INDEX system_audit_tenant_time_idx (tenant_id, created_at, id), INDEX system_audit_command_idx (command_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

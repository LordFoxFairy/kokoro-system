# kokoro-system 数据模型

状态：当前 canonical schema 说明，2026-09-04。唯一可执行事实源是
[`../database/schema.sql`](../database/schema.sql)；本文记录 owner、不变量、查询依据和缺口，不替代 SQL。

## 1. 存储策略

**已实现**

- PostgreSQL 16+ 保存 durable System facts；表/列/constraint/index 使用小写 snake_case。
- 只有一个 `database/schema.sql`，没有 migration ledger 或历史 migration 目录。
- `pnpm db:apply-schema` 在 transaction + advisory lock 中检查 public schema 为空，再安装当前 schema；它不升级旧库。
- V1 明确不使用 `FOREIGN KEY`/`REFERENCES`；关系由 application/repository transaction、tenant predicate、row lock、
  CHECK 与业务 UNIQUE 维护。
- 瞬时点使用 `TIMESTAMPTZ(3)`；应用 row mapper 输出 RFC 3339 UTC；tenant ID 为 opaque `TEXT`，资源 ID 为 UUID。
- Redis 不保存 durable fact，只缓存完整 Runtime Manifest，TTL 30 秒。

## 2. Schema owner inventory

| Table | Owner/fact | Tenant | 当前 production path |
|---|---|---|---|
| `system_product` | Product catalog key/name/status | global | Manifest read；无 HTTP writer |
| `system_product_profile` | Product profile/version | global | Schema only；当前 source 无 reader/writer |
| `system_config_release` | Config release/digest/state/version | nullable column；HTTP writer 为 tenant | HTTP create/transition；Manifest 只读取同 tenant published release |
| `system_release_binding` | scope/product 到 release 的 active binding | `scope_type/scope_id` 表达 | Manifest 将 active tenant binding 与同 tenant published release 联查；无 application writer |
| `system_config_record` | module/config/scope/locale/value/version/release | global 可 null，其余 tenant | HTTP list/upsert；Manifest assembly |
| `system_audit_event` | 未接入的 audit-shaped schema artifact | nullable | Schema only；当前 source 无 writer/reader，需与 IAM Audit owner 重新确认 |
| `system_site` | Tenant Site identity/display/timezone/state | required | HTTP create/list；Host resolution |
| `system_site_host` | Site hostname binding | required | 随 Site 创建；list/resolve；无独立管理 surface |
| `system_workspace` | Tenant Site 下 Workspace | required | HTTP create/list |
| `system_site_policy` | Site locale/product/public policy | required | HTTP get/put；Host resolution 默认 locale |
| `system_command_receipt` | Mutation idempotency request hash/response | required | 所有 control-plane mutation |

“Schema only”表示表已存在，但当前 runtime 没有相应 application use case；不能把表存在解释为功能已交付。

## 3. 资源标识与关系

```text
system_site (tenant_id, id)
  -> system_site_host (tenant_id, site_id)
  -> system_workspace (tenant_id, site_id)
  -> system_site_policy (tenant_id, site_id)

system_product.id
  -> system_product_profile.product_id
  -> system_release_binding.product_id
  -> system_config_record.product_id

system_config_release.id
  -> system_release_binding.release_id
  -> system_config_record.release_id
```

这些箭头是应用关系，不是数据库 FK。

**当前维护**

- Site + 初始 Host 在一个 idempotent transaction 中创建；active hostname 在全表唯一。
- Site list 的 Host JOIN 同时使用 `tenant_id` 与 `site_id`。
- Workspace create 先查同 tenant、非 archived Site，再写 Workspace。
- Policy put 先查同 tenant Site，锁当前 active policy，原位 version + 1。
- Site Host resolve 同时约束 tenant、active Site、active Host，并用 tenant+site LEFT JOIN active policy。
- Release transition 锁 release，检查顺序状态，并按 expected version update。
- Manifest 的 tenant binding 与 Config Release 按 `release_id` 联查，并同时要求 binding active、release tenant 与请求 tenant
  一致、release status=`published`；不满足时 release-specific Config 不进入结果。

**缺口**

- Config upsert 未验证 `product_id`、`release_id` 的存在、tenant、状态或 scope 一致性。
- Release Binding 没有 application writer，publish 也不自动创建 binding。
- Product/Profile 没有 application management surface。
- 不同 idempotency key 并发创建同一 Config identity 时，当前“先查再写”没有 UNIQUE 兜底，可能产生重复 active rows。
- Policy 查询只看 active policy；Site archive/suspend lifecycle surface 尚不存在，关系回收没有实现。

## 4. 业务 UNIQUE 语义

| Name | Columns/predicate | 业务语义 |
|---|---|---|
| `uq_system_product_key_active` | `product_key WHERE active` | 同一 active product key 唯一 |
| `uq_system_product_profile_key_active` | `product_id, profile_key WHERE active` | Product 内 active profile key 唯一 |
| `uq_system_config_release_tenant_key` | `COALESCE(tenant_id,''), release_key WHERE not retired` | tenant/global 非 retired release key 唯一；retire 后可复用 |
| `uq_system_release_binding_active` | scope/scope_id/product WHERE active | 每个 scope+product 只有一个 active binding |
| `uq_system_site_tenant_key_active` | `tenant_id, site_key WHERE not archived` | tenant 内非 archived Site key 唯一 |
| `uq_system_site_host_active_hostname` | `hostname WHERE active` | active hostname 跨 tenant 全局唯一 |
| `uq_system_site_host_site_hostname` | `tenant_id, site_id, hostname` | 同 Site 不重复登记同 hostname（含 archived） |
| `uq_system_workspace_tenant_site_key_active` | tenant/site/workspace key WHERE not archived | Site 内非 archived Workspace key 唯一 |
| `uq_system_site_policy_active` | tenant/site WHERE active | Site 只有一个 active policy |
| `uq_system_command_receipt_tenant_key` | tenant/idempotency key | tenant 内 command key 全局唯一 |

`system_config_record` 当前没有 config identity UNIQUE；这是已登记缺口，不应通过文档假设唯一。

## 5. 状态与 CHECK

| Table | 状态/检查 |
|---|---|
| Product/Profile | `active/archived` |
| Config Release | `draft/validated/published/retired`、version > 0、digest 64 位小写 hex |
| Release Binding | `global/tenant/product/surface` scope、`active/archived`、非 global 必须有 scope_id |
| Config Record | scope enum、`active/deleted`、schema/config version > 0、digest hex |
| Site | `draft/active/suspended/archived`、version > 0 |
| Site Host | `active/archived`、hostname 必须非空小写 |
| Workspace/Policy | `active/archived`、version > 0 |
| Command Receipt | `pending/completed`；status 与 response/completed_at 必须一致 |

Application 当前只暴露部分状态路径，详见 [`TECHNICAL_DESIGN.md`](TECHNICAL_DESIGN.md)；Schema enum 不等于所有
transition 已实现。

## 6. 查询、索引与 cursor

- Manifest lookup 使用 product status/key、tenant+product active binding、release tenant/status 与
  tenant/locale/module/scope/product/status config indexes；输出 version 使用 BIGINT 数值最大值。
- Site/Host、Workspace、Policy query 的索引以 tenant 作为前导或显式过滤条件。
- Audit Event 索引支持 tenant+time 与 command 查找，但当前没有 runtime query。
- Command Receipt 唯一索引支持 claim conflict，created index为未来 retention/inspection 提供顺序。
- List API 当前按 UUID `id` 升序，cursor 为该 UUID 的 base64url；它是稳定不透明协议，不是 offset。

## 7. JSONB 与 digest

- `value_json` 保存 module-owned structured config；核心 scope、locale、product、release、version 均为普通列。
- Policy 的 locale/product allow-list 当前为 JSONB string array，并由 row decoder验证。
- Receipt `response_json` 保存首次 domain result；replay 时由类型专属 decoder 重新校验。
- Config digest 是 `SHA-256(JSON.stringify(value))`；Manifest digest 是 assembled object 的同类 hash。

**缺口**：没有 canonical JSON 规范；Config `schema_version` 没有 registry validator；digest 不是签名或内容授权证明。

## 8. Retention、审计与恢复

**当前实现**：Schema 含 soft-delete/retired 字段和 append-only `system_audit_event` 形状；Redis TTL 自动淘汰 manifest。

**缺口**：没有 receipt/audit/retired row retention job、partition、archive、legal hold、backup restore script 或已记录恢复演练；
`system_audit_event` 也未接入 application writer，且 Root 将 Audit 事实归 IAM，表的长期 owner 尚待独立架构决策。生产 retention、RPO/RTO 与备份由部署/数据 owner 明确后再落地，
不能从当前 Schema 推断。

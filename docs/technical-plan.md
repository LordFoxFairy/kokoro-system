# kokoro-system 技术方案

状态：2026-09-01；本仓实现边界。跨仓 wire contract 仍以根仓 `contract/` 为唯一来源，本文件不复制
Proto/OpenAPI schema。

## 1. 所有权与依赖

```text
IAM/BFF -- TenantRequestContext + host binding --> System
System -- Runtime Manifest --------------------> BFF/Session consumers
System -- configuration references ------------> owning services (read-only reference)
```

System 负责：Site（租户下的站点配置边界）、Workspace（站点下的工作区目录）、配置记录、站点策略、
release 状态和 assembled Runtime Manifest。IAM 负责登录、主体、租户、Host/domain、权限和身份断言；
System 不写入这些事实。Workspace 不是 Agent 的 `RuntimeNamespace`，也不选择 graph/checkpoint。System
不调用 Model Provider，不拥有模型、支付、积分、Capability 或 Session 事实。

## 2. 资源模型

| 资源 | 隔离键 | 状态 | 说明 |
|---|---|---|---|
| Site | `tenant_id` | `draft → active → suspended → archived` | `hostnames` 仅配置记录；Host 真正归属由 IAM 判定 |
| Workspace | `tenant_id + site_id` | `active → archived` | 只做产品工作区目录，不承载 Agent runtime state |
| SitePolicy | `tenant_id + site_id` | `active → archived` | locale/product allow-list、public manifest 开关 |
| SystemConfig | `tenant_id`（global 可为空）+ scope | `active → deleted` | 软删除、版本化、JSON value；不存 secret |
| ConfigRelease | `tenant_id` | `draft → validated → published → retired` | 发布必须顺序推进，manifest 只使用 active binding |

数据库不使用外键、级联或业务唯一索引。应用层做冲突查询；生产实现通过短事务/行锁确保同一 tenant
下的 key 和幂等 receipt 一致。所有 SQL 参数化，时间按 UTC 存储。

## 3. Manifest 组装

查询先按 tenant/product/locale/surface/release 过滤，再按 `(module_key, config_key)` 选择：

```text
surface > tenant > product > global
exact locale > locale NULL
current release > release NULL
config_version > id
```

组装结果只包含 navigation、localization、theme、feature flags 和跨 owner references。`digest` 为
结果 SHA-256，`configVersion` 为所选记录最高版本。Redis 只缓存完整 manifest，key 必须同时包含
namespace、tenant、product、locale、surface/default；cache identity mismatch、IAM mismatch、PostgreSQL/Redis
错误均 fail closed。

## 4. 入口与权限

- HTTP：`GET /healthz`、`GET /readyz`、`/system/*`。
- RPC：`POST /rpc/kokoro.system.v1.SystemService/GetRuntimeManifest`，仅作为同一 application service
  的 JSON transport fixture，不生成第二份业务实现。
- 读资源需要 IAM context permission `system:read`；写资源需要 `system:write`；release 状态变更需要
  `system:publish`。权限数组只在请求内存中消费，不落库。
- 所有 mutation 要求 `Idempotency-Key`；同 tenant + key + request hash 重放原响应，hash 不同返回
  `IDEMPOTENCY_KEY_REUSED`。
- 响应总有 `x-kokoro-request-id`；输入 request id 缺失时由 System 生成 UUID。错误不返回 SQL、Redis
  key、IAM token、连接串、堆栈或 Provider payload。

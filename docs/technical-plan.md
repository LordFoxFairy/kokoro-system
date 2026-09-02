# kokoro-system 技术方案

状态：2026-09-02；本仓实现边界。跨仓 wire contract 以根仓 `contract/` 为准，本文件描述 System 的实现契约。

## 1. 所有权与依赖

```text
BFF -- trusted tenant_id + Forwarded host --> System
System -- Runtime Manifest ----------------> BFF/consumers
System -- references ----------------------> owning services (read-only)
```

System 负责 Tenant 作用域下的 Site、Site Host、Workspace、SitePolicy、配置记录、release 状态和 Runtime Manifest。
IAM 负责 Tenant、用户、组织、认证、Role、Permission 与身份断言。System 不保存登录凭据或 IAM 权限事实，
不调用 Model Provider，也不拥有 Payment/Credit、Model、Capability、Storage 或 Session 事实。

`tenant_id` 是唯一跨仓隔离键；`site_id` 是 System 内部 Site 资源 ID；`host` 只用于 System 自己的 Site Host 解析。
不存在 `iam_site`、`iam_tenant_site_binding` 或跨仓 Host lookup。

## 2. 资源模型

| 资源 | 隔离键 | 状态 |
|---|---|---|
| Site / Site Host | `tenant_id`，内部关联 `site_id` | `active → suspended → archived` |
| Workspace | `tenant_id + site_id` | `active → archived` |
| SitePolicy | `tenant_id + site_id` | `active → archived` |
| SystemConfig | tenant scope 或 global + scope | `active → deleted` |
| ConfigRelease | `tenant_id` | `draft → validated → published → retired` |

PostgreSQL 保存事实；Redis 只缓存完整 manifest。所有租户字段使用 opaque text `tenant_id`，跨服务不建外键；同一
System 数据库内的 Site/Workspace/Policy 关系由本仓约束和事务维护。所有 mutation 使用幂等 receipt，时间为 UTC。

## 3. Manifest 组装

请求先校验本仓 `tenant_id + host` Site 绑定，再按 tenant/product/locale/surface/release 过滤配置：

```text
surface > tenant > product > global
exact locale > locale NULL
current release > release NULL
config_version > id
```

结果只包含 System 自有配置及跨 owner reference；digest 为 assembled manifest 的 SHA-256。Redis key 必须包含
namespace、tenant、product、locale、surface/default，命中后再次校验响应身份。

## 4. 入口与权限

HTTP 包括 `/healthz`、`/readyz`、`/system/*`，RPC fixture 与 HTTP manifest 复用同一个 application service。
受信权限数组只在请求内存中消费：读资源需要 `system:read`，写资源需要 `system:write`，release transition 需要
`system:publish`。Mutation 必须带 `Idempotency-Key`；响应统一携带 `request_id`。

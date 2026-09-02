# kokoro-system

`kokoro-system` 是租户级 Site、Host、Workspace、站点策略、系统配置与 Runtime Manifest 的唯一事实边界。
PostgreSQL 保存配置与发布事实，Redis 只保存完整 manifest 热缓存和运行时协调状态；依赖不可用时 manifest fail closed，
不使用进程内或旧快照降级。

`tenant_id` 是跨仓唯一隔离键，由受信 BFF/服务上下文传入。`site_id` 是 System 内部资源 ID，`host` 是 System
内部用于解析 Site 的输入。System 在自己的数据库中校验 `tenant_id + host`，不调用 IAM 的 Host 接口，也不读取
IAM 数据库。IAM 只负责 Tenant、用户、认证、组织、Role、Permission 与身份上下文。

## 文档入口

- [`api-contract.md`](api-contract.md)：HTTP/RPC、资源、错误、分页和幂等契约
- [`technical-plan.md`](technical-plan.md)：模块、状态机、持久化和依赖边界
- [`bff-integration.md`](bff-integration.md)：Web/Admin BFF 接入约束
- [`runbook.md`](runbook.md)：本地启动、readiness、故障恢复和回滚
- [`acceptance.md`](acceptance.md)：验收矩阵及 fixture 命令
- [`risk-register.md`](risk-register.md)：风险、监控和上线前置条件

System 不存储登录凭据、IAM 权限事实或 Model Provider 配置，不调用 Model Provider；它只消费受信
`TenantRequestContext` 和 BFF 传入的 Forwarded/Host。浏览器提交的身份、租户或 Host header 不得直接透传为
内部上下文。

配置 `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 后，runtime manifest、RPC manifest 和全部 `/system/*` 业务路径必须携带
`x-kokoro-service: web-bff` 以及匹配的 `x-kokoro-internal-secret` 或 `Authorization: Bearer`。健康探针保持公开；
未配置 service token 时业务路由 fail closed。

运行时只需要 `DATABASE_URL`、`REDIS_URL` 以及可选的 System host、port、Redis namespace、BFF service token。

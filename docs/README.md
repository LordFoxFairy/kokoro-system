# kokoro-system

通用产品配置控制面，独立拥有 Site、Workspace、系统配置、站点策略和 Runtime Manifest 的配置事实。
PostgreSQL 是配置与发布事实源，Redis 是 manifest 热缓存和运行时协调依赖；Redis 或 PostgreSQL 不可用时
runtime manifest fail closed，不使用进程内降级缓存。

`tenant_id` 由 kokoro-iam 根据 Host/domain 提供并校验；system 只消费受信 `TenantRequestContext`，不建立第二套租户或身份事实。
所有写入使用应用层冲突查询、PostgreSQL 行锁、软删除；数据库不使用外键、级联和业务唯一索引。

## 文档入口

- [`api-contract.md`](api-contract.md)：HTTP/RPC、资源、错误、分页和幂等契约
- [`technical-plan.md`](technical-plan.md)：模块、状态机、持久化和依赖边界
- [`bff-integration.md`](bff-integration.md)：Web/Admin BFF 接入约束
- [`runbook.md`](runbook.md)：本地启动、readiness、故障恢复和回滚
- [`acceptance.md`](acceptance.md)：验收矩阵及 fixture 命令
- [`risk-register.md`](risk-register.md)：风险、监控和上线前置条件

System 不存储登录凭据、IAM 权限事实或 Model Provider 配置，不调用 Model Provider；它只接收 IAM/BFF
服务端构造的 `TenantRequestContext`，并在实际 manifest/control 请求前校验 Host 与 tenant binding。

运行时必须配置 `DATABASE_URL`、`REDIS_URL`、`KOKORO_IAM_BASE_URL` 和
`KOKORO_IAM_BACKEND_TOKEN`。system 在读取或缓存 manifest 前调用 IAM 的内部
Tenant/domain binding 契约，Redis 不可用时不使用进程内降级缓存。

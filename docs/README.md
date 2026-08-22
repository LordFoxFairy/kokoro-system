# kokoro-system

通用产品配置控制面。MySQL 是配置与发布事实源，Redis 是 manifest 热缓存和运行时协调依赖；Redis
或 MySQL 不可用时 runtime manifest fail closed，不使用进程内降级缓存。

`tenant_id` 由 kokoro-iam 根据 Host/domain 提供并校验；system 只消费受信 `TenantRequestContext`，不建立第二套租户或身份事实。
所有写入使用应用层冲突查询、MySQL 行锁、软删除；数据库不使用外键、级联和业务唯一索引。

运行时必须配置 `DATABASE_URL`、`REDIS_URL`、`KOKORO_IAM_BASE_URL` 和
`KOKORO_IAM_BACKEND_TOKEN`。system 在读取或缓存 manifest 前调用 IAM 的内部
Tenant/domain binding 契约，Redis 不可用时不使用进程内降级缓存。

# kokoro-system 风险清单

| 风险 | 影响 | 当前控制 | 上线前动作 |
|---|---|---|---|
| 应用层冲突查询与 receipt 并发竞态 | 重复写入 | tenant/key/hash receipt、短事务约束、审计 | 在目标 PostgreSQL 上做并发压测并确认锁策略 |
| IAM context header 被非 BFF 入口伪造 | 跨 tenant 读写 | 网络边界、IAM binding、BFF 不透传浏览器 header | 网关只允许受信 workload，并记录 rejection metric |
| Redis 缓存陈旧或串租户 | 错误配置下发 | 完整 key、identity check、TTL、fail closed | 监控 hit/miss、digest mismatch、tenant mismatch |
| 发布 binding 与 release 状态漂移 | 旧配置继续服务 | 顺序状态机、PostgreSQL 事实源 | 增加发布 binding 的原子事务和 reconciliation job |
| policy 只配置未接入 IAM Host fleet | 站点策略不生效 | Host 归属仍以 IAM 为准，System 不复制域名事实 | 联调 IAM site/domain response 与策略选择 |
| Config JSON schema 版本不兼容 | manifest 组装失败 | schema_version 与 digest | 为每个 module 注册运行时 schema validator |

当前明确不纳入 System：登录凭据、权限事实、Model Provider 调用、Agent runtime namespace、Session
聊天事实和 Capability/Storage 私有数据。

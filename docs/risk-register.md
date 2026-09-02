# kokoro-system 风险清单

| 风险 | 影响 | 当前控制 | 后续动作 |
|---|---|---|---|
| 同租户命令 receipt 并发竞态 | 重复写入 | tenant/key/hash receipt 与短事务 | 在 PostgreSQL 上补并发锁测试 |
| BFF 上下文被非受信入口伪造 | 跨 tenant 读写 | BFF service-auth、可信网络边界、System Host 校验 | 记录拒绝指标并做跨入口测试 |
| Redis 缓存陈旧或串租户 | 错误配置下发 | 完整 cache key、identity check、TTL、fail closed | 监控 hit/miss/digest mismatch |
| release binding 与 release 状态漂移 | 旧配置继续服务 | 顺序状态机、PostgreSQL 事实源 | 增加 binding 原子事务测试 |
| Site Host 记录与租户上下文不一致 | 错误站点策略 | `system_site_host(tenant_id, site_id, hostname)`、Host 唯一约束、读取前校验 | 增加多 Host 管理接口和冲突指标 |
| Config JSON schema 不兼容 | manifest 组装失败 | schema_version 与 digest | 为 module 注册运行时 validator |

System 明确不纳入登录凭据、IAM 权限事实、Model Provider 调用、Agent runtime state、Session 聊天事实以及
Capability/Storage 私有数据。

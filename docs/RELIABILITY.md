# System 可靠性

## 当前机制

- PG durable facts、同事务 receipt + generation + mutation；失败回滚，不把 Redis 当权威。CAS 与关系创建/父删除采用同父行锁，真实双连接两序测试。
- Manifest global+tenant fence；resolve model-global+tenant fence，读/写 cache 前后重验，最多 3 次有界重试。cache identity/schema/digest 错误与 Redis 故障 fail closed，不返回陈旧配置。
- Model route 仅 healthy 且 observed_at 未超过健康时效；cache 命中最终 fence 后再次检查健康截止。Model unhealthy 不影响 Site 等基础控制面 readiness。
- 请求预算默认 10s，断连/超时通过 AsyncLocalStorage AbortSignal 传播 PG 与 Redis；取消 PG socket 不回池，HTTP deadline 503，已取消事务不得 late commit。
- PG max10/connect3s/statement5s/query6s/lock3s；Redis 单命令2s，有限 reconnect 指数退避。receipt 死锁/serialization 最多3次 jitter 重试。
- shutdown 默认10s：停止维护调度、取消维护、停止接入、销毁到期HTTP/PG连接（包括尚在握手的socket）、释放Redis。实际 source SIGTERM 与黑洞PG握手测试覆盖；不依赖 server.requestTimeout 冒充业务预算。
- 每小时维护（1000候选/查询、有界5s预算）；各 owner 独立事务，receipt7天/普通软删30天/退役无binding release90天。hold暂停purge，不暂停orphan检测或延长restore截止。失败记录，下一周期重试；不自动删immutable事实。
- JSON stdout 只输出 service/pid/operation/request_id/trace_id/result/duration_ms/count。finish/断连 close 只记录一次；禁止 token、URL query、body、原始依赖错误。

## 外部前置与未验项

TLS/mTLS、持久化备份/恢复演练、生产告警投递、长期容量/错误预算与进程编排不是本地测试结果。当前Docker daemon API500阻断RC镜像实跑；CI源码/依赖/secret/镜像扫描及SBOM/provenance已配置，不冒称CI已执行。真实命令证据见 ACCEPTANCE。

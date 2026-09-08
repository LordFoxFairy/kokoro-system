# System Runbook

## 启动

Node24.13.0/pnpm12.3.4；配置以 `src/config/system-env.schema.ts` 和 `.env.example` 为准。三个不同服务token都必填；不要打印环境/连接URL/secret。
先探测复用现有PG/Redis；独立空System库执行 `pnpm db:apply-schema`，随后 `pnpm dev`。已有表拒绝安装，不当migration运行、不reset未知库。容器需要对外监听时HOST设0.0.0.0。

## 诊断

1. `/healthz`看存活，`/readyz`看本仓PG/Redis，不以Model供应商健康判全服务失败。
2. 用x-request-id检索JSON日志；检查operation/result/duration。403检查caller身份/权限/scope；409检查CAS/receipt payload/relation状态；503检查依赖、health时效、fence churn。
3. Model unhealthy先用admin health CAS更新已观测状态，不跳过时效、不发旧route；Agent resolve错误证据保留revision/generation（仅成功返回）。
4. Maintenance orphan_detected先隔离相关业务查询并排查写入owner/数据恢复过程，不直接DELETE immutable快照。持有合规/运维留存请求时设RETENTION_HOLD=true重启；仍检测，30天restore不延长。每周期最多1000候选，失败下周期继续。
5. SIGTERM正常drain；forced结果为非零退出，检查在途工作。不要对共享PG/Redis执行FLUSHDB、重启或全量DROP。

## 验证与发布

`TEST_ADMIN_DATABASE_URL=... TEST_REDIS_URL=... pnpm verify`：随机独立库+namespace，schema安装、全部测试、实际source启动。管理员权限只用于隔离测试建库，不作为生产业务凭据。
Linux RC：docker build后指定SYSTEM_SMOKE_IMAGE执行scripts/system-runtime-smoke.ts --image；脚本仅清自己创建库/容器，复用infra。目前本机Docker API500，RC门未验，不重置daemon。

发布前 Root committed HEAD复跑本仓门与BFF/Agent live；备份、恢复、轮换、容量和告警投递须部署环境单独演练。本轮不是九仓生产验收。

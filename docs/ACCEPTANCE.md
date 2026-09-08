# System 验收证据

当前 R6 基线：`280d5d0567c94de33e32f0e85f163fbcf75ede20`，下述G5为已验历史，末尾R6为本次工作树证据。G5代码起始基线`51bc22dac4b32da86984e7147caaae5e4db6a34a`；Root committed HEAD 跨仓证据在 Root `docs/CURRENT.md` 绑定最终 SHA。历史G1–G4完整证据见唯一 IMPLEMENTATION_PLAN，不与当前结果混用。

## 已执行的G5聚焦证据

| 门 | 实际结果 |
| --- | --- |
| `test/integration/system-lifecycle.test.ts` | 5pass：正式Nest启动/partial failure、HTTP锁deadline503无late commit、PG黑洞握手drain、restore原子PG时钟30天、request-id/probe |
| `test/integration/system-maintenance.test.ts` | 4pass：hold（含过期receipt key拒绝复用）、7/30/90天、近期child阻止父清理、timer真实触发、逐类orphan与EXPLAIN、deletedLabel保留retiredRevision不误报 |
| `test/integration/system-source-start.test.ts` | 3pass：真实pnpm dev与退出、spawn ENOENT注册DB清理、docker rm失败后独立DB清理 |
| `test/unit/system-request-lifecycle.test.ts` | 1pass：close/finish仅一条cancelled脱敏日志 |
| `test/contract/http-owner-boundary.test.ts` | 2pass：旧层/RPC/SDK/DOM退出、CI/release Node24与隔离smoke入口 |

TDD具体失败：restore期限原200→期望409后修；PG握手drain原2951ms→要求<800ms后追踪全部socket修；断连原success→cancelled once-finalizer修；hold receipt原201→409保留修；旧树存在→HTTPonly退出门修。source smoke初始误用401与launcher全进程组SIGTERM导致null退出，按冻结403契约及日志中的真实runtime PID信号修，未放宽实际runtime exit0。

## 完整门（当前工作树实际结果）

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm contract:check
TEST_ADMIN_DATABASE_URL=postgresql://USER@localhost/postgres pnpm test
TEST_ADMIN_DATABASE_URL=postgresql://USER@localhost/postgres pnpm test:schema:fresh
```

最新执行：format/typecheck（含scripts）/lint/build全pass；contract:check含Redocly合法性、83+2 drift、18source provenance、12contract tests全pass；完整13files/86pass/0skip，日志`/tmp/system-g5-owner-postreview-verify.log`；fresh安装23断言22表pass。新增restore矩阵22pass，七类29/30/31天、应用时钟偏移与PG事务内跨截止，失败不推进version/generation/receipt；成功Model两global generation各+1。Presentation/Feature >64KiB/32KiB真实HTTP由503 RED修为具名约束400非retryable，版本/generation/receipt无副作用。

测试无配置直接失败，不静默skip。每次只创建自身system_g*随机库并清理，cache只独立namespace与TTL，不FLUSHDB。83method/path/CAS/permission/scope由架构测试与真实HTTP矩阵核对，Redocly独立规范校验，18source与artifact drift/provenance分别验证。

## 未验/外部事项

Docker daemon当前API500/无版本socket请求超时，Root独立确认环境故障；Node24.13.0-bookworm-slim registry digest已核得，但镜像build/RC实跑未验，未重置daemon。CI源码/依赖/secret/镜像scan、SBOM/provenance是配置，不是已执行证明。Root BFF/Agent live及active topology切换需在G5最终提交后复验；生产备份恢复/容量/长窗口SLO/告警投递另验。


Root探索跨仓live已PASS（基线51bc22d+未提交G5树，显式dirty）：System/BFF正式source、发布binding结果、BFFcatalog/default/manifest、跨tenant隔离、BFFresolve403、Agent真实SystemModelClient默认/显式/factory映射；自建DB/prefix/process group全部清理。消费者BFF26eec011、Agente24b4aa。仅探索证据，最终仍需Root提交及committed HEAD重跑。

最终frozen install通过（319项supply-chain policy，15.2s），pnpm audit --prod --audit-level high：No known vulnerabilities found；这不是OS镜像/secret scan结果。fresh安装再次23断言22表通过，随机库均清理。

Root最终脚本窄修已复跑完整pnpm verify：13files86pass0skip+fresh23/22，日志/tmp/system-g5-owner-postreview-verify.log。unit进程组leader先退仍清后代、清理聚合失败、单build同image发布静态门3pass；实际source/ENOENT/docker失败fixture3pass。发布使用同runner一次构建→smoke/scan/SBOM→比对image ID→tag/push，不重建；Docker rm/stop的status/error均显式判定。所有cleanup独立执行，成功在cleanup全部完成后输出。Root prod/full pnpm audit均无已知漏洞；其他本地scan工具未装，镜像RC未验不变。

## Root 最终冻结树复验

2026-09-08，Node24.13.0/pnpm12.3.4，独立PG数据库/Redis namespace：
`TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres TEST_REDIS_URL=redis://localhost:6379/2 pnpm verify`
→ format/lint/typecheck/build/contract 全通过；13 files / 86 tests passed / 0 skipped；fresh 23 断言、22 表。
日志 `/tmp/kokoro-system-g5-root-final-verify.log`；没有将测试删除前的 legacy 结果混入此数。
Root `pnpm audit --prod --audit-level=high` 与 `pnpm audit --audit-level=high` 均无已知漏洞；OS/secret/image扫描不在此结论内。

## 已提交源码复验

Root已在 `d7257aa56632627fe0ba8ec4576c32c550a25c3d` clean HEAD 重跑同一 `pnpm verify`，86pass/0skip、fresh23/22、所有质量/contract门通过。随后真实 System/BFF source HTTP 与 Agent resolve/factory跨仓smoke PASS，全部owned资源清理。证据日志 `/tmp/kokoro-system-g5-committed-verify.log`、`/tmp/kokoro-system-g6-committed-live.log`；此后本提交仅回填三份验收文档，不修改源码。Docker/未跑CI项如上保留，不作发布全绿声明。


## R6 typed lint / 中性错误 / Nest 公开面（待Root提交）

Node24.13.0，基线280d5d clean后唯一writer实施；无package/lock/SQL/OpenAPI artifact变更。真实type-aware recommendedTypeChecked+projectService，8条显式Promise/unsafe/switch规则由实际ESLint正反fixture验证。原始81条typed诊断逐项修复，无eslint-disable、规则降低、断言弱化；多数源码变更为中性错误import/删除status实参及pg/unknown类型收紧。

RED：typed lint81诊断（`/tmp/r6-lint-red.json`）；中性错误测试模块未存在失败（`/tmp/r6-errors-red.log`）；public-only真实树1fail2pass（`/tmp/r6-boundary-red.log`）。GREEN：错误18码/status/retryable及nativeHTTP异常字节矩阵2pass；架构7pass（实际typed正反、public-only、精确exports/消费者、循环与禁止依赖）；真实lifecycle6pass（单次配置解析、已构造PG/Redis partial failure shutdown）。

完整 `TEST_ADMIN_DATABASE_URL=postgresql://USER@localhost/postgres TEST_REDIS_URL=redis://localhost:6379/2 pnpm verify`：移除临时诊断后的完整验证`/tmp/r6-final-clean-verify.log`为15files96pass0skip+fresh23/22、全部质量/契约门通过。第一轮`/tmp/r6-verify.log`同样通过；中间一次`/tmp/r6-final-verify.log`的96tests通过但model afterAll10s超时，见下方风险，不冒称该轮通过。资源全部独立随机DB/Redis namespace，不FLUSHDB或重启共享infra。

冻结artifact SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37` 未变；provenance保留原18输入、加Products public入口第19源，Manifest路径变化的源码digest如实更新。consumer disposition反映System280d5d/BFF26eec011/Agente24b4aa已有committed HTTP验证；本R6提交后Root仍独立复验。Docker RC/尚未执行CI扫描与生产环境证据保持原未验状态，不被静态门替代。


R6一次未复现风险：中间全量run的model afterAll超时10s，未提高hook timeout、未删用例。失败后PG无该轮system_g4残库/连接；focused11pass，临时分阶段诊断全量连续3次96pass（`/tmp/r6-diagnostic-full-1.log`至3），cleanup入口只有idle COMMIT，app.close2–3ms、DB清理43–49ms；移除诊断后完整verify再次全绿。原失败无阶段trace，无法据此归因HTTP或DROP，因此记录待Root独立复验观察，不伪造已修复根因。namespace ModuleRef反例另RED1fail6pass后修门，最终架构7pass；未改业务源码解决该非复现事件。

R6最终冻结复跑：`/tmp/r6-freeze-verify.log`完整15files96pass0skip+fresh23断言22表，包含namespace/alias架构门最终版本；format/lint/typecheck/build/contract全部通过。`git diff --check`通过；SQL/OpenAPI artifact/package/lock均无diff。system_owner停止写入，Root审查并在主工作树复验/提交。

### R6-guard 最终窄修与重冻结

Controller相对database/cache依赖四负例（含直接/alias手工Repository）先RED1fail6pass；实现严格规则后真实HealthController两依赖触发RED，未加豁免。Root批准同目录HealthService聚合readiness，Controller仅委托，Module注册；Health单测证明live不触依赖、ready成功与两依赖失败语义不变。focused架构7+Health1共8pass。最终`/tmp/r6-guard-verify.log`完整16files97pass0skip+fresh23断言22表，全部format/lint/typecheck/build/契约门通过；未扩大timeout，未删业务断言，artifact/SQL/package/lock无diff。唯一writer再次停写，Root审查提交。

## R44 Root 完整 owner 门（2026-10-01）

Root在23path冻结manifest11b6f2f1上实际Node24.20.0 pnpm verify exit0：format/lint/typecheck/build、contract/lint/provenance及完整16文件176tests通过（56.47s），含原六个lifecycle用例；fresh23断言/22表/完整canonical catalog一致。日志/tmp/kokoro-system-schema-r44-root-full-verify.log。PG18.4、既有role nako/Redis14，fixture自有随机库，执行前后pg_database完整名单一致，fresh system_g1_a695b6e0defe4a3cb3c5665704128357已回收；无新共享基础设施或前缀批删。只发布本namespace/catalog切片：PG16 CI、cross-owner单库完整组合、正规用户登录/真实模型/费用浏览器链仍待验，不用176或fresh冒充整链。下方此前失败与候选证据保留历史。

# System 当前状态

## R40-WIN05 当前切片：catalog 后继候选，待 Root 完整验收

Root 已通过 R39 四文档门；真实 RED 日志为 `/tmp/kokoro-system-schema-r40-root-red.log`：R1 57 fail/10 pass，R2/R3 3 个真实 PostgreSQL fail；6 个旧 lifecycle case 因筛选 skip，不计通过。Root 报告 fixture finally 后无新 prefix 残留。源码基线仍为 main `c0a76a3a7614bf46ea6e665e523f24261862436f`。

- 本轮授权内的 parser/config/Pool ready/installer、现有 fixture 与 fresh/smoke/模板/CI 连接选址已改为显式 owner，canonical 22 表 SQL、机器/生成/provenance、业务模块、依赖与 lockfile 锁定。
- Root 已在 `/tmp/kokoro-system-schema-r40-root-core-and-catalog-red.log` 真实执行冻结核心/catalog：kernel 67/67；资源 7 fail/6 pass/6 旧例筛选 skip，七 drift 均到达真实 snapshot deep equality。原 R39 安装/选址/缺 namespace 和 view/function/type 非空各三项通过；此证据不代表全 owner 验收。
- 后继仅修改 catalog helper、fresh reference gate 与四文档 R40 当前段。helper 在 readonly repeatable-read session 快照完整结构/表达式/函数/trigger，身份归一与稳定排序，未知语义失败关闭；fresh 用随机自有 reference namespace 的同 canonical SQL 期望，原 23 行为断言保留。冻结 parser/runtime/installer、七＋三 resource 断言/fixture、SQL、机器/生成与其余核心文件不动。
- System 窗口只执行纯单进程配置、静态/契约门及资源收集；不访问 PG/Redis、不启动服务、不操作 Git。源码候选未提交，Root 组合/消费者 URL 未改；不得把此半阶段称为可发布完整 cutover。
- 核心波次纯门已通过 check/contract（83 business + 2 probes / 19 sources / 12 tests）及原 kernel 67；当前 catalog 后继再跑同一纯门，实际结果与 SHA 见本窗口冻结报告。worker 未自行访问 PG/Redis，完整 snapshot SQL 语义、13 项真实 PG、fresh 23 不变量及全 owner 门待 Root 真跑。
- 后续：Root 在冻结后继重跑真实 PG/fresh/完整 owner 门、独立审查，再提交/发布；源码候选不是已验收结果。唯一任务表仍为 Root `docs/task.md`。

## R39-WIN05 D0 当前切片：文档候选，待 Root 验收

2026-10-01。当前源码基线 `c0a76a3a7614bf46ea6e665e523f24261862436f`，分支 main。本轮只允许修改本仓 `docs/TECHNICAL_DESIGN.md`、`docs/API_CONTRACT.md`、`docs/DATA_MODEL.md`、`docs/CURRENT.md`；System 唯一 writer，Root 独占 Git/index/commit 与基础设施操作。执行任务继续记录 Root `docs/task.md`，不创建新计划。

### 已核实当前态（不是目标态）

- Config 只校验 PostgreSQL URL，未要求唯一 owner schema，也未在 URL parser 前拒绝原始控制字符。当前安装依赖 pg 合并 connectionString 参数可能覆盖显式 options；schema query 本身不自动设置 search_path。
- Pool 固定 `search_path=public,pg_catalog`，ready 仅执行 `SELECT 1 AS healthy`，未确认目标 namespace、有效 current_schema 或 UTC 路由。
- installer 固定 service 级 advisory key、检查 public 表并安装到 public；“blank database” 文案不代表检查全部数据库 namespace。fresh fixture 数 22 表并验证 23 项不变量，未覆盖完整 catalog drift。
- canonical SQL 是唯一事实源，22 个 unqualified 表、两 immutable guard 函数及 trigger 不改；无新增业务 schema/contract/依赖/role。现有业务的 tenant/权限/CAS/receipt/fence/事务及取消/drain 安全行为必须保留。

### D0 目标态与文档门

| 设计面 | 本仓文件                   | 对齐方案                                                                                                                                                  |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 技术   | `docs/TECHNICAL_DESIGN.md` | 唯一显式 selector、raw 控制字符先拒绝、URL options 禁止覆盖；纯解析配置，UTC/owner path；owner+schema 锁与事务安装，runtime 不建/fallback，ready 校验目标 |
| API    | `docs/API_CONTRACT.md`     | 现有 83 操作+2 probes、wire/error/artifact 不改；ready 在原 503 dependency 路径失败关闭；schema 不来自请求/tenant                                         |
| 数据   | `docs/DATA_MODEL.md`       | target-only 全对象空边界、原 canonical SQL；只读 owner catalog helper、Root 隔离 reference 安装生成期望，准确身份归一化；保留 23 行为断言                 |

三个面已写成同一候选方案；是否通过文档门由 Root 内容审查、四文档 SHA 与提交记录确定，不自行宣布通过。源码、新 `database-url.ts`、catalog helper、测试、SQL、machine/generated 均未实施。当前配置与安装仍为上述 public 基线，旧验收不证明 owner-schema 已可运行。

### 后续门（尚未授权/执行）

1. Root 冻结/审查 D0 后独立授权 tests-only RED：现有 `test/unit/system-kernel.test.ts` 的 R1 URL/config；现有 `test/integration/system-lifecycle.test.ts` 的 R2 public 非空而 owner 空的安装隔离、R3 owner runtime 路由/UTC/缺失 namespace readiness。不得导入不存在文件而用收集失败冒充 RED，不削减原断言。
2. RED 证据后才放行精确 GREEN 范围。源码、其余六份 integration fixture、CI、`.env.example`、source-start/smoke、Root 消费者 URL 和资源编排均等待后续授权，不因 D0 自动解锁。
3. Root 在最终冻结主工作树执行（Node 24，资源及凭据由 Root 管理）：

```bash
pnpm exec vitest run --no-file-parallelism --maxWorkers=1 test/unit/system-kernel.test.ts test/integration/system-lifecycle.test.ts
pnpm check
pnpm contract:check
pnpm test:schema:fresh
pnpm verify
```

本轮未运行上述命令，未启动/操作 PostgreSQL、Redis、服务或 Git；只交付四文档差异与保护范围哈希核验。未闭环：D0 Root 验收/commit、RED、GREEN、catalog drift 与完整资源门均待后续。后续 owner：Root 放行与集成验收，System 执行受限切片。

## 既有源码与历史验收记录

以下保留原历史记录，其中“当前/完整/已验收”仅指其注明的提交和验收波次；不作为 R39 单库 namespace 目标通过证据。本轮当前态及限制以上节为准。

2026-09-08。G1 `f5702068d4416ad90b1bd02af57d2825c32be916`、G2 `d057deb706a34129e23bec5ec1f70e235ca1d4ce`、G3 `f13bb73dfe81c3d79036852d3d3cb7a6cbb1916d`、G4 `51bc22dac4b32da86984e7147caaae5e4db6a34a` 已由Root提交验收。当前为 **完整 System 源码、消费者 HTTP 与 NestJS 工程边界均已提交验收**：G5业务代码 `d7257aa56632627fe0ba8ec4576c32c550a25c3d`，R6工程收敛 `dcfa8468446108c17cd65b32fc028af261472c99`；完整任务历史只维护 IMPLEMENTATION_PLAN。

## 当前源码事实

- 唯一正式入口main→startSystem→Nest AppModule；Node24/Nest12/Express、SQL-first pg、Redis6；五模块83业务operation+2probes均实际挂载。
- sites/workspaces/products/runtime-manifests/model-catalog完整业务已实现；跨module写表边界、tenant/scope、权限、CAS、receipt、父锁完整性、immutable快照、发布绑定和缓存fence由真实PG/Redis测试承接。
- Model resolve仅Agent、litellm，不推理、不回凭据/endpoint；明确tenant默认policy，无first-row fallback；health时效最后fence后重验。
- 正式生命周期包括三个服务token必填、部分启动失败释放、请求budget/断连PGRedis取消、HTTP deadline无late commit、未完成PG握手socket有界drain、脱敏JSON一次日志。
- Maintenance定时器已接线；7/30/90天、逐资源父锁/反查、永久identity tombstone、restore原子PG时钟30天截止、hold与orphan检测，默认每小时最多1000候选/查询与5s cycle预算。
- 旧全局四层、旧Node router、RPC/Proto/generated、SDK/相关依赖、DOM lib已删除。旧有效安全/一致性行为测试映射在任务表；没有保留alias/fallback充数。
- HTTP artifact仍2.0.0，SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37`，R6保留原18输入并加Products public入口为第19源，源码digest真实更新，artifact字节不变。

## 验证与未闭环

G4 committed HEAD：51pass/0skip（7 focused files）；旧全量152pass/5legacyfail/8skip仅作历史，不作为当前结果。G5最新完整本仓13files/86pass/0skip；format/typecheck（含scripts）/lint/build/Redocly/drift/18source provenance/contract12pass；fresh schema23断言22表通过，详见ACCEPTANCE。Root 已在最终冻结树重跑完整 `pnpm verify`：13 files / 86 pass / 0 skip，fresh 23 断言 / 22 表；Root 已在该 committed clean HEAD 再跑相同全门通过，并完成真实消费者HTTP联调；详细日志见 Root `docs/CURRENT.md`。

Root冻结源码跨仓live已PASS：System/BFF正式pnpm dev、发布binding覆盖、catalog/default/manifest、跨tenant404/空catalog、BFF resolve403、Agent真实default/explicit+factory映射；committed HEAD 重跑已PASS，记录见 Root CURRENT。BFF consumer `1e03b87` + dev `26eec011`，Agent `e24b4aa`已提交测试；Root拥有旧Model active退出/九active拓扑，不由System复制其文件。

**镜像发布已闭环**：本机Docker Desktop故障未重启；改由tag触发GitHub Actions。`v0.1.2`绑定 `7252d50c67338842978961244e86a884daa87f5b`，release run `34222465469`与常规CI run `34222465488`均成功。测试、fresh schema、镜像build、真实image smoke、HIGH/CRITICAL Trivy门、SBOM生成与GHCR推广全部通过；`0.1.2`/`0.1`/`latest`指向digest `sha256:8fe6e701451f461b02b84c6520d76f49ad872c8f11d6ae3a8c5b80532797eb37`。user-owned private repository不支持GitHub attestation，两个attest步骤按仓库可见性明确跳过，不冒称已有attestation。长期生产SLO/容量/灾备/secret轮换仍属部署环境证据。

## R6 已提交工程收敛（`dcfa8468446108c17cd65b32fc028af261472c99`）

第一轮及移除诊断后的完整verify均15files96pass0skip+fresh23/22通过（`/tmp/r6-final-clean-verify.log`）。中间一次model afterAll10s超时未复现，三轮诊断及后续完整门通过，风险如实记录ACCEPTANCE。真正typed lint已启用并清除81条原始诊断；SystemError无HTTP status、18码映射与完整envelope保持；四public入口与最小Nest exports、Repository零HTTP依赖、唯一DI配置已实现。真实生命周期6pass，含单次配置解析与部分失败两资源关闭。新增架构实际typed规则正反、公开面/消费者/循环/禁止依赖门。

R6-guard最终提交后，Root 在 clean `dcfa8468446108c17cd65b32fc028af261472c99` 独立复跑 `pnpm verify`：16files/97pass/0skip、fresh23断言/22表，全部质量与契约门通过；跨仓 source HTTP smoke PASS 且 owned resources removed；Root结构门对System为0违规。Controller零database/cache直连（probe也无豁免），HealthService承接原ready聚合，手工Service/Repository含alias门已补。日志 `/tmp/r6-root-verify-committed.log`、`/tmp/r6-root-smoke-committed.log`。原一次非复现hook风险继续保留。

## R7 v0.1.1 发布修复（已由远端镜像门验证）

基线f487f635294c98cb8a44e638ed1ee0afa6d28feb。固定Debian12.13 runtime中libcap2需deb12u3、libgnutls30需deb12u7；按Root提供的v0.1.0扫描证据，在runtime依赖安装前执行apt-get update/upgrade并清apt lists，不降低Trivy exit-code、不加ignore/VEX。package版本0.1.1，无业务/SQL/OpenAPI/lock变更。Node24完整verify16files98pass0skip+fresh23断言22表，日志`/tmp/r7-verify.log`；v0.1.1远端Trivy已通过并完成GHCR推广，后续仅受private仓attestation平台能力影响而整单标红。

## R8 v0.1.2 tag发布闭环

Root确认v0.1.1 Actions34221703911的verify/fresh/build/image smoke/Trivy/SBOM/GHCR push全部通过，镜像已发布0.1.1/0.1/latest，digest `sha256:827bb91720fbd1bbe0fe2dab1efaae98b3905b7830c491535c5de5f0e2bf34b4`。随后provenance attestation因GitHub不支持user-owned private repositories而失败，SBOM attestation被跳过；因此镜像已发布但该workflow为红，不能写成镜像未发布或attestation成功。
R8仅为两个attestation step增加`github.event.repository.private == false`条件，private仓明确跳过，不降低测试/smoke/漏洞扫描/SBOM生成/push门。package0.1.2，Dockerfile/业务/SQL/OpenAPI/lock不变。Root提交 `7252d50c67338842978961244e86a884daa87f5b` 并推送tag `v0.1.2`；release run `34222465469`成功，常规CI run `34222465488`亦成功，发布digest为 `sha256:8fe6e701451f461b02b84c6520d76f49ad872c8f11d6ae3a8c5b80532797eb37`。

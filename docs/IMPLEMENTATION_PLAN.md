# System 完整交付唯一实施计划

当前：G1目标设计/机器契约/SQL门；Root ADR031已批准完整System，system_owner唯一writer，Root提交审查。
第0–1节是G0历史证据，旧“仅文档/未冻结”只说明当时授权，不覆盖第2节当前任务卡。业务实施待G1放行。

## 0. G0历史基线与范围

| 项目 | 记录 |
|---|---|
| 日期/owner | 2026-09-07 / kokoro-system |
| 工作目录 | /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system |
| 分支 | codex/production-closure-docs |
| 起始 commit | 966cabef49e69c871186cb9de464854fc5c18087 |
| 起始未提交 | System 无；Root 的 SQL 手册、kokoro-agent、.tmp/ 为任务外变更，不暂存 |
| IAM 盘点 HEAD | e07f60e12cf06c230333672624a19d37a164cb90；CURRENT 记录源码验收 a68cc441f4a0a9bb32dd1f202691a5a44afa629a，不代表完整 IAM |
| 代码地图 | /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/docs/CODEBASE_MAP.md |
| TS 手册 | /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/docs/kokoro-handbook/standards/08-typescript-backend-engineering.md |
| SQL 手册 | /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/docs/kokoro-handbook/standards/03-sql-and-postgresql.md |
| SQL 工作树摘要 | SHA-256 60e912ab1eac65a7e1b7fa28c2c0177d236cee8bae899b2360b946bc6a95a9e4；已有未提交变更，本轮只读取 |
| TS 工作树摘要 | SHA-256 7cbe64c89b670b1a5ac235a7915ab7791b144dd8daebd38cbb3e6cded4cb397a |

这些摘要固定本轮所读规范，不冒充已提交规范版本。下一阶段重新核验，并记录未提交规范的最终归档/提交 owner。

### 唯一写入文件集

均位于上述 System 绝对工作目录；允许修改以下文件，不允许扩大到代码、contract 或 schema：

- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/AGENTS.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/TECHNICAL_DESIGN.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/API_CONTRACT.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/DATA_MODEL.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/CURRENT.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/INDEX.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/IMPLEMENTATION_PLAN.md（新建）

选择本位置而非 Root 新 spec 的理由见 TECHNICAL_DESIGN G0.3。旧 2026-09-03 文档计划已完成，保留为历史记录，
本文件接管后续任务，不继续用旧计划的四层/工具链要求授权重构。

## 1. 当前任务卡

| ID/优先级 | 业务目标与完成条件 | Agent/审查/权限 | 范围与依赖 | 状态/提交责任 |
|---|---|---|---|---|
| G0-01 / P0 | 固定事实、文档门未决项、候选目录，不把推荐当已实现 | Root / system_g0_review / 唯一文档 writer | 上述七文件；依赖已读规范及源码盘点 | 已验收（准备文档）；Root 提交 b4dbff6 |
| G0-RPC / P0 | 列出现存 Site/Model 协议的生产/测试/历史消费者，识别 ADR 约束 | system_protocol_inventory，gpt-5.6-sol / Root / 只读 | System/Model/BFF/Agent contract 与 src，禁止更改 | 已验收（静态盘点）；无写入/提交 |
| G0-REVIEW / P0 | 复核 G0 文档对用户纠正、当前事实和目标的表达一致性 | system_g0_review，gpt-5.6-sol / Root / 只读 | G0-01 七文件；依赖 draft 完成 | 已验收；无写入/提交 |
| G0-VERIFY / P0 | 主仓重跑差异/链接/现有门禁，记录通过与未跑原因 | Root / 独立审查建议 / 验证 | 文档工作树；不跑 schema 安装或共享数据测试 | 已验收（证据记录）；b4dbff6 提交后已复验 |

任务状态：待派工 → 进行中 → 待审查 → 待集成验证 → 已验收。
G0 的“已验收”仅指准备文档与证据，不表示 G1 文档门或业务功能完成。

## Chunk 1: G0 文档准备

### G0-01：修正技术方案入口

- [x] 读取规范、当前目录、源码/机器契约与 Git 状态。
- [x] 在 TECHNICAL_DESIGN 添加当前/目标能力矩阵、候选技术栈、目录选择与禁止预建项。
- [x] 在 API_CONTRACT 登记协议消费者/身份/契约生成方向未决项，不修改 wire。
- [x] 在 DATA_MODEL 登记唯一 schema、Config 并发、Site identity、Model adapter 与 Audit owner 未决项。
- [x] 更新 AGENTS、CURRENT、INDEX 与本任务表，清除子仓强制旧四层的规范要求。
- [x] 主控检查 diff：只改七个授权文档，旧当前行为记录仍存在且明确是当前实现。

验收断言：独立 releases/generated/proto 均非既定目标；pg/Prisma 没有被描述为已安装新栈；
IAM 完整目标与已验切片分开；Model owner cutover 没有被描述为已完成。

### G0-RPC：真实协议依赖盘点

- [x] 搜索 SiteService/ResolveSiteByHost、ModelCatalogService/Resolve、Connect client 与 HTTP adapter。
- [x] 逐条记录生产调用、工具脚本、测试、生成未消费与历史材料，不能用零关键词命中证明不存在消费者。
- [x] 对照 ADR-029 和本仓 ADR-0002，列出取消或保留 RPC 各自的 contract/消费者变更要求。
- [x] Root 复核证据，将结论记入本表与 API_CONTRACT；未发现的外部消费者仍列未决。

静态盘点结果：BFF 的 System /system/runtime-manifest 与 Model /bff/model-catalog 两路径均缺 /v1；
owner 实现分别只接受 /v1/system/runtime-manifest 与 /v1/bff/model-catalog。Root 已直接复核双方源码，
尚未运行真实请求，不宣称运行时故障已复现。Site RPC 未发现仓内外部生产 caller；Agent Model client 尚未接线。
完整路径证据见 API_CONTRACT 的 G0 生产消费者盘点。BFF 修复属于后续独立授权切片，不在七文件范围内。

### G0-REVIEW：独立设计审查

- [x] 派只读审查员，固定起始 SHA + 七文件 working-tree diff，禁止代码/Git 写操作。
- [x] 审查业务粒度、身份边界、发布需求、生成物、schema 来源、任务权限和完成声明。
- [x] Root 修订明确问题；同一审查员复核至无本轮阻断项，保留建议与后续风险。

system_g0_review 在 966cabe + 七文档工作树上复核通过。修正项：
消费者证据统一为绝对路径；availability 保留 ADR 业务边界、物理粒度留 G1，改变边界先修订 ADR；
Root slice 补全可执行命令。结论仅为本轮准备文档无阻断，不表示 G1 设计门通过。

## Chunk 2: G0 验证与交付

### G0-VERIFY：只读验证

工作目录：
/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system

- [x] 运行 git diff --check；实际零空白错误。
- [x] 使用 Python 标准库检查七文件内的本地 Markdown 文件链接（忽略 http 与页内 anchor），33 个文件链接，零缺失。
- [x] 运行以下现有门禁；它们只证明旧源码/当前契约基线，不证明新架构通过：

~~~bash
pnpm exec vitest run --no-file-parallelism test/architecture/layer-boundary.test.ts test/http-contract-source.test.ts
pnpm lint
pnpm typecheck
pnpm contract:lint
~~~

- [x] 从 Root 执行治理脚本的 System slice，实际 10 项未达标，见下表；不放宽门禁。
- [x] 按七个明确路径暂存、检查 staged diff，提交一个自洽文档准备切片。
- [x] 在 committed HEAD 重跑相关检查，验证 System 工作树干净，更新本表证据。

本轮不运行 db:apply-schema/integration/runtime smoke：没有数据变更，也未申请隔离数据库；
不执行 contract:generate：本轮不改生成代码；
完整 test/build 与生产验收不属于 G0 声明范围，后续实现需全部真实执行。

### 验证记录

2026-09-07，Root 在 System 966cabe + 本轮七文档 working-tree diff 上执行：

| 命令/检查 | 实际结果 |
|---|---|
| git diff --check | 通过，无空白错误 |
| Python 本地 Markdown 文件链接检查 | 33 个链接，0 缺失；不检查页内 anchor/远程 URL |
| pnpm exec vitest run --no-file-parallelism test/architecture/layer-boundary.test.ts test/http-contract-source.test.ts | 2 files / 13 tests 通过 |
| pnpm lint | exit 0 |
| pnpm typecheck | exit 0 |
| pnpm contract:lint | exit 0；11 paths / 13 governed operations |
| Root System governance slice | 10 项未达标，见下方；不是目标架构已通过 |

Root 首次临时 runpy 调用未设置 scripts 导入路径，报 ModuleNotFoundError: governance；
修正调用环境后获得以下真实 10 项结果，未修改 verifier：

~~~bash
cd /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro
python3 - <<'PY'
import runpy, sys
from pathlib import Path
sys.path.insert(0, str(Path("scripts").resolve()))
checks = runpy.run_path("scripts/verify-ten-repository-standard.py", run_name="system_g0_audit")
failures = []
for name in ("check_common", "check_delivery", "check_typescript"):
    checks[name]("kokoro-system", failures)
print(f"System governance: {len(failures)} violations")
for failure in failures:
    print(failure)
raise SystemExit(bool(failures))
PY
~~~

未达标：缺 src/modules、旧四层仍在、Node engines 未对齐 24、缺 strictDepBuilds、缺 format:check、
缺 noFallthroughCasesInSwitch、缺 noEmitOnError、skipLibCheck、target 非 es2024、lib 未限定 ES2024。
这些字段均未在文档准备任务中修改，必须由后续实际架构/工具链切片解决，G0 不以改测试或放宽规则清零。

G0 文档准备可在上述未达标项显式交接后单独验收；System 工程/业务与 G1 目标设计门仍未通过。
提交后的 SHA 与重跑结果由交付报告给出；文档不自引用无法预知的 SHA。

### 已提交设计基线的复验

交付 commit：b4dbff67f703af247f43fb79de835fbc0e50633a。
Root 在该 commit、System 干净工作树上重跑：聚焦 2 files / 13 tests、lint、typecheck、contract:lint、
git diff --check 均通过；本地文件链接 33 个、0 缺失；Root System slice 仍是上述 10 项未达标。
提交后首次临时链接扫描误将 fenced Python 代码里的下标函数调用当成 Markdown 链接；
排除 fenced code 后重新扫描通过。这是检查器误识别，不是改链接掩盖缺失；仓库检查脚本未更改。
本节证据更新形成独立文档记录提交，最终 HEAD 由会话交付报告给出。

## 2. 完整 System 任务卡（Root ADR-031 已批准）

| 任务 | 归属/执行/审查 | 基线/范围 | 依赖/验证 | 状态/交付 |
|---|---|---|---|---|
| G1 P0 完整设计与机器门 | System / system_owner 唯一writer / Root | /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system；codex/production-closure-docs；7dde8e7683ad4c9a3a35bc3681bf44b523eea574，初始干净；docs、AGENTS/README/INDEX、canonicalSQL、contract、模块schema、scripts/contract测试、必要package工具链 | ADR031；三文档一致；schema生成/typecheck/freshPG | 待Root审查；Root串行暂存提交，worker禁止index/commit |
| G2 P0 Nest内核与Sites/Workspace | 同一负责人 / Root | 批准后src模块/进程/测试/CI；准确文件集开工前补 | G1 Root放行；保留旧行为及测试、Auth/CAS/真实PG | 待G1；不是最终缩减交付 |
| G3 P0 Products/Manifest完整闭环 | 同一负责人 / Root | Product/App/Feature/exposure/presentation/config/release/binding与Manifest | G2；tenant/site隔离、policy、global+tenantfence、CRUD/生命周期/恢复 | 待实施 |
| G4 P0 Model完整合入 | 同一负责人 / Root | model-catalog所有子能力与测试 | G3；immutable revision/routing/health/真实PG-Redis | 待实施；不写旧Model仓 |
| G5 P0 System全门禁 | 同一负责人 / Root+独立只读审查 | System lint/format/typecheck/test/build/schema/smoke/CI/docs | G2–4；主仓重新验证 | 待实施 |
| G6 P0 consumer与拓扑cutover | Root派BFF/Agent/拓扑各owner | 排除System writer写入范围 | System artifact提交后串行；真实catalog/resolve调用、旧Model/RPC/身份退出 | 待Root |

最终范围是G1–G6完整System，内部切片仅为审查提交粒度。G1交付后暂停业务实现，Root快速审核放行，同负责人继续。
G0旧“协议/ORM未定”“仅文档不改schema”是当时事实，已由ADR031与本任务卡替代，不再作为当前阻断。
三份权威路径：
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/TECHNICAL_DESIGN.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/API_CONTRACT.md
- /Users/nako/WebstormProjects/github/thefoxfairy/Kokoro/kokoro-system/docs/DATA_MODEL.md

### G1证据

基线测试由baseline审查员：22files/111pass，3files/8真实integration skip，非完整integration通过。
目标依赖与验证结果如下。PG localhost5432/Redis localhost6379复用；仅清理自己创建system_g1数据库。
业务Service/Controller/Repository/main尚未获本阶段写入许可，不将G1 artifact或schema安装称作完整System完成。

### ROOT-GATE 并行只读依赖
Root唯一writer；基线Root 7aaf211f（并行提交可变）；仅scripts/governance/{ten_repository_standard.py,typescript_checks.py}和scripts/tests/test_ten_repository_standard.py。修复将当前TS允许的src/database、src/http误判retired，以及pnpm旧11.25.0硬锁；先失败测试后修复并pytest。不得改active topology、放宽业务检查或触碰Root现有dirty文件。System writer不改这些Root文件。


### G1 精确依赖与兼容证据（2026-09-07核验）

| 依赖 | 锁定 | 证据/取舍 |
|---|---|---|
| Node / pnpm |24.13.0 /12.3.4|本地node --version、pnpm --version；Node24 LTS按Root ADR031 |
| Nest common/core/platform-express |12.0.1|npm registry元数据MIT；core Node>=20，common/core/adapter peer ^12.0.0；实际安装无peer冲突，StandardSchemaValidationPipe实际接受/拒绝Zod输入 |
| reflect-metadata / rxjs |0.2.2 /7.8.2|满足Nest ^0.1.12或^0.2.0 / ^7.1.0 peers；不安装可选class-validator/transformer重复DTO |
| Zod |4.5.4|MIT；实际runtime parse、toJSONSchema、Nest Pipe、tsc/build验证；退出可用Standard Schema但需重新生成contract |
| pg / redis |8.23.0 /6.2.1|MIT；npm engines分别>=16/>=20；实际freshPG23断言；Redis新client运行连接/fence在G2真实集成待验，退出通过模块cache API不泄露驱动类型 |
| TS / @types/node |6.0.3 /24.13.3|TS Apache-2.0；strict+ES2024+noEmitOnError/noFallthrough+skipLibCheck=false；当前Connect2声明依赖HeadersInit，暂保留lib DOM，仅G1过渡，G2删除RPC后必须移除DOM，不创建类型alias |
| Redocly CLI |2.46.1|MIT；Node>=22.12.0或20.19，固定已在BFF核验的版本；独立OpenAPI3.1规范lint通过0warning，不以自身generator比较代替规范验证；工具提示2.51.2升级留独立审查，不改变当前锁 |
| Prettier |3.9.6|MIT；仅格式化本G1新增/修改TS，不批量改旧业务；全仓format门留G2清除旧树时闭环 |

其他现有工具依赖固定安装实际版本，唯一pnpm-lock；strictDepBuilds=true。官方元数据来源npm registry对应版本（npm view … version engines peerDependencies license --json），实际运行结果而非IAM候选经验作为兼容证据。未执行完整供应链漏洞/镜像扫描，不声称生产安全已验。

### G1实跑结果与交付边界

- RED：新增target suite起初因schema不存在失败；实现后目标9tests全部通过（BIGINT、scope、metadata/module数量、默认路由、协议与Nest Pipe）；旧Proto owner5tests通过。
- contract:generate:openapi：83业务+2probes；独立数量sites11/workspaces6/products35/runtime-manifests1/model-catalog30，method-path去重与CAS/permission/scope组合断言。
- contract:lint：Buf旧Proto+Redocly2.46.1 OpenAPI3.1规范校验0warning+drift/metadata通过；verify:contract-provenance校验runtime source/OpenAPI及仍保留旧Proto digest。
- typecheck/build/lint：当前G1全部通过；这只证明schema/旧进程编译，不证明Nest业务已实现。
- TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm test:schema:fresh：PG18.4 fresh安装+非空重装拒绝+23项断言，22张表；最近隔离库system_g1_1804aa10dff54a99a7fdbca895f53ee2已清理。首次脚本发现管理员search_path非public，显式设public,pg_catalog与UTC后重跑通过；不是修改共享PG参数。
- 最终全量test：26files，21pass/2fail/3skip；128tests，115pass/5fail/8skip。5fail为如下旧契约/目录代际断言，业务保留测试未见额外失败；不称全绿。G1新增目标artifact与保留的旧runtime测试有明确代际冲突；test/http-contract-source.test.ts旧固定13 operation/旧meta/旧schema名字断言，以及test/architecture/layer-boundary.test.ts禁modules/http仍待G2替换，未放宽或删除这些测试。
- 当前HTTP业务源码未写，canonicalSQL receipt/scope/表与旧Service不兼容；禁止部署G1或在旧业务上冒称fresh smoke。真实CRUD/父删除竞态/retention/Redisfence/consumer/CI均G2–G6待验。
- Root审查前保持工作树，不git add/commit/checkout；交付SHA由Root串行提交后记录。Root追加准许src/http/protocol.schema.ts仅HTTP wire schema及生成器共用，无I/O。

### ROOT-GATE 验收
Root commit36c9e7790980f39f97895cdd0b211887dd2897bf；3文件，RED4fail8pass→GREEN36pass，Root committed HEAD复跑36pass，Ruff format/check通过；独立审查无阻断。全scripts/tests另2项旧基线失败（示例预期18实际11、旧章节名），Root用git archive复现，非本切片引入。

G1最终检查：2026-09-08；pnpm verify:contract-provenance（18source）及本切片Prettier check通过；git diff --check通过。G1状态待Root审查，writer停止写入等待放行G2–G5。

### G1 Root 放行证据（2026-09-08）

Root在7dde8e7+交接40文件的稳定工作树重跑：target 9pass、旧Proto owner 5pass、Redocly规范lint/drift/18source provenance、typecheck/build/lint、diff check全部通过。
独立fresh PG验证22表/23断言通过，Root创建的system_g1_68ad6bcc12e84e40b71293246d892dda已清理并查询确认不存在。
Root全量test复现115pass/5fail/8skip；5项为已声明旧契约/旧目录断言，日志/tmp/kokoro-system-g1-root-tests.log。它们必须在源码切换时用目标行为测试替换，未标记完整验收。
system_consumer_plan只读最终复核无阻断：conditional Config、tenant-only Release、全局Config禁止release、83操作分布、错误状态、receipt作用域与跨module只读完整性规则一致。
G1设计/机器门通过；本提交为不可部署的设计先行过渡点。Root提交后同负责人获准连续实施G2–G5全部业务与门禁；G6消费者以此已提交owner契约为依赖，最终验收仍包括完整cutover。

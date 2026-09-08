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
| TS / @types/node |6.0.3 /24.13.3|TS Apache-2.0；strict+ES2024+noEmitOnError/noFallthrough+skipLibCheck=false；当前Connect2声明依赖HeadersInit，暂保留lib DOM，仅G1过渡，G5删除RPC后必须移除DOM，不创建类型alias |
| Redocly CLI |2.46.1|MIT；Node>=22.12.0或20.19，固定已在BFF核验的版本；独立OpenAPI3.1规范lint通过0warning，不以自身generator比较代替规范验证；工具提示2.51.2升级留独立审查，不改变当前锁 |
| Prettier |3.9.6|MIT；仅格式化本G1新增/修改TS，不批量改旧业务；全仓format门留G2清除旧树时闭环 |

其他现有工具依赖固定安装实际版本，唯一pnpm-lock；strictDepBuilds=true。官方元数据来源npm registry对应版本（npm view … version engines peerDependencies license --json），实际运行结果而非IAM候选经验作为兼容证据。未执行完整供应链漏洞/镜像扫描，不声称生产安全已验。

### G1实跑结果与交付边界

- RED：新增target suite起初因schema不存在失败；实现后目标9tests全部通过（BIGINT、scope、metadata/module数量、默认路由、协议与Nest Pipe）；旧Proto owner5tests通过。
- contract:generate:openapi：83业务+2probes；独立数量sites11/workspaces6/products35/runtime-manifests1/model-catalog30，method-path去重与CAS/permission/scope组合断言。
- contract:lint：Buf旧Proto+Redocly2.46.1 OpenAPI3.1规范校验0warning+drift/metadata通过；verify:contract-provenance校验runtime source/OpenAPI及仍保留旧Proto digest。
- typecheck/build/lint：当前G1全部通过；这只证明schema/旧进程编译，不证明Nest业务已实现。
- TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm test:schema:fresh：PG18.4 fresh安装+非空重装拒绝+23项断言，22张表；最近隔离库system_g1_1804aa10dff54a99a7fdbca895f53ee2已清理。首次脚本发现管理员search_path非public，显式设public,pg_catalog与UTC后重跑通过；不是修改共享PG参数。
- 最终全量test：26files，21pass/2fail/3skip；128tests，115pass/5fail/8skip。5fail为如下旧契约/目录代际断言，业务保留测试未见额外失败；不称全绿。G1新增目标artifact与保留的旧runtime测试有明确代际冲突；test/http-contract-source.test.ts旧固定13 operation/旧meta/旧schema名字断言，以及test/architecture/layer-boundary.test.ts禁modules/http仍待G5替换，未放宽或删除这些测试。
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

## 3. G2–G5 放行与准确实施集（基线f570206）

Root已提交并复验G1 f5702068d4416ad90b1bd02af57d2825c32be916，批准完整实施。同仓唯一writer仍system_owner，Root串行提交。
执行executing-plans与TDD：先记录失败断言，再实现；不另建任务中心、不生成外部worker。

| 项 | 放置结论 |
|---|---|
| Owner/current | System五模块；f570206干净基线；旧main仍启动旧进程，目标schema已先行 |
| 职责 | Nest显式Module/DI、唯一pg/Redis连接、可信HTTP上下文、sites/workspaces真实CRUD/CAS/幂等/生命周期 |
| 位置比较 | 复用旧bootstrap/application会延续全局四层；采用src/{database,cache,access,http,health,config}技术职责及既定modules，旧树在主入口cutover时删除 |
| 粒度 | 具名Service决定用例/事务，Repository写SQL；不建通用CRUD/BaseRepository/coordinator。技术transaction/receipt只处理原子性，不分派业务命令 |
| 依赖 | 模块独占写表；同client跨module只读父锁/引用检查；Service不写SQL，Controller不持久化 |
| API/data | 严格使用已冻结runtime schema；保持83业务+2probe目标，G2先挂载17操作的测试应用，不把未挂载G3/G4标成可部署完整System |
| 删除 | G5一次切换main并删除旧树/RPC/SDK；G2不加兼容路由/501，旧与目标不会同时启动 |
| 验证 | G2真实PG/Redis隔离测试+Nest HTTP+unit/contract/typecheck/build/lint；G5完整route inventory与全门禁 |

| 切片 | 精确写入集（均System根下） | 验收/状态 |
|---|---|---|
| G2 | src/config/{config.module,system-config,system-env.schema}.ts；src/database/{database.module,database.service,transaction-context,command-receipt,command-digest,row-decoder}.ts；src/cache/{cache.module,cache.service}.ts；src/access/{request-context,request-context.decorator,tenant-scope,access.decorator,access.guard}.ts；src/http/{owner-error,error.filter,response.interceptor,conditional-request,pagination,configure-http}.ts；src/health/{health.module,health.controller}.ts；src/app.module.ts；src/modules/sites/{sites.module,sites.controller,sites.service,site.repository,domain.repository,policy.repository,host-normalizer}.ts；src/modules/workspaces/{workspaces.module,workspaces.controller,workspaces.service,workspace.repository}.ts；test/{unit,integration,architecture}新增对应目标测试；必要package/tsconfig与当前计划 | 进行中；源码测试组合根不替代生产完成；Root提交 |
| G3 | src/modules/products/{products.module及各资源controller/service/repository/mapper}、runtime-manifests/{runtime-manifests.module/controller/service/repository/cache}；对应test/{unit,integration,contract,architecture}；app.module；必要schema/contract变化先报Root | 待G2；完整产品、发布binding、policy和双fence |
| G4 | src/modules/model-catalog/{model-catalog.module、catalog/provider/label/revision/routing/health/resolve具名controller/service/repository}、对应测试、app.module | 待G3；不改已派consumer的catalog/resolve契约，必要变化先报Root |
| G5 | src/main.ts、src/config、src/health、必要retention/reconciliation具名worker；删除src/{application,domain,infrastructure,interfaces,bootstrap,generated}/旧树、src/index.ts旧导出、sdk旧客户端、Proto工具；更新test/scripts/CI/Docker/README/INDEX/docs/package/tsconfig | 完整83操作/2probe、旧有效测试由目标测试承接、lib DOM移除、全门禁与真实smoke |
| G6-BFF | system_consumer_plan / sol唯一BFF writer，Root提交；基线2d1dd0a；排除dirty docs/api/v1/agui-chat.md、test/lifecycle.test.ts | 依赖System f570206、artifact2.0.0 / f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37；Root回填SHA/证据 |
| G6-Agent | Root唯一Agent writer，基线70a3813 clean；窄resolve客户端、factory实际接线与测试文档；不重构全Agent | 同artifact依赖；不改System源码；Root回填SHA/证据 |

### G2 可审查切片交接（2026-09-08，基线f570206）

状态：待Root审查/串行提交；system_owner停止写入供提交，放行后立即续G3，不缩减G2–G5总范围。
本切片实现真实Nest AppModule、17业务操作与2 probes；生产main未切换，不是完整System可部署状态。
新增技术支持文件以本节上表准确集合为准；未创建site.mapper，简单Row转换归src/database/row-decoder.ts。
仅新增开发声明依赖@types/express 5.0.6（MIT），与现有Nest Express12精确安装、strict typecheck/build实测兼容；无运行依赖升级。

实跑（Node24.13.0/Pnpm12.3.4）：

- `TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm exec vitest run --no-file-parallelism test/integration/system-target-control.test.ts test/unit/system-kernel.test.ts test/architecture/system-target-boundary.test.ts test/contract/system-target-contract.test.ts test/contract/proto-owner-boundary.test.ts` →5files/26pass/0skip。
- G2新增12项：真实集成7、unit3、architecture2。隔离system_g2随机数据库应用canonicalSQL、真实Redis随机namespace；结束关闭Nest连接并删除自己的数据库。测试缺管理员配置直接报错，不静默skip。
- 覆盖Sites/Workspace CRUD、domain/policy、可信身份/permission/tenant隔离、未知输入/JSON/1MB边界、request-id、CAS含超JS安全整数、同键并发重放/摘要冲突/actor隔离、global与名为global的tenant receipt隔离、事务回滚、双连接父删除/子创建两个锁顺序、真实readiness、17路由与写表owner矩阵。
- `pnpm typecheck && pnpm build && pnpm lint && pnpm contract:lint && pnpm verify:contract-provenance` →全部exit0；Redocly有效，83+2目标inventory与18source provenance不变。数据库schema和consumer artifact未修改。
- `TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm test` →29files：24pass/2fail/3skip；140tests：127pass/5fail/8skip。5项仍是G1已记录旧HTTP契约4项与旧目录1项，不新增失败；旧8项真实集成仍skip，未当作已验。完整日志/tmp/system-g2-owner-all-tests.log。

明确后续：G3全部Products/Manifest；G4全部Model；G5生产入口及旧树/Proto/SDK/libDOM清理、完整route/permission/CAS矩阵、retention/reconciliation、deadline/drain、观测与完整CI/smoke。30天restore窗口尚待G5落实；当前恢复Site不自动恢复已删除域名，避免抢回他人占用host。G2局部真实门通过不等于完整运行职责验收。

### G6 消费者源码切片实交付（Root提供，2026-09-08）

- BFF：1e03b87da55c41e256cf625a8cb7829ded7bba81；Root Node22 lint/typecheck/build/test150pass、contract63operations/15tests全pass，committed HEAD150pass；16精确文件，未触碰他人dirty。
- Agent：e24b4aab05ee6df811c21089effbe1f91d7c2f2c；Root uv lock/sync、ruff/pyright/contract/build通过，全pytest611pass/6skip/77deselect，focused38pass。独立review无P1/P2，UUID/int边界已修；全仓format仍80个未触碰baseline失败，archive基线81，不宣称全仓format通过。
- 两消费者源码切片已验收；live System联调smoke仍依赖G5/G6，不能据此宣布完整cutover。

### G2 Root 稳定工作树复验
Root在f570206 + 交接43文件上重新运行26个聚焦测试（含真实隔离PG/Redis与HTTP），0fail/0skip；
typecheck/build/lint/Redocly规范校验/83operation drift/18source provenance全部通过。
全test复现127pass/5既有fail/8旧integration skip，日志/tmp/kokoro-system-g2-root-all.log；没有放宽旧断言。
Root已检查Access/Service/Repository/receipt锁与生命周期、确认隔离system_g2数据库清理；独立只读审查未发现P1/P2。
此提交仍非生产入口cutover；G3–G5完整能力和G6 live验收继续由同负责人推进。

### G2 Root验收与G3进行中

G2提交d057deb706a34129e23bec5ec1f70e235ca1d4ce（43文件）；Root修正error.filter.ts唯一格式问题后39TS格式通过，committed HEAD 26pass/0skip；typecheck/build/lint/contract/provenance通过，全test127pass/5既有fail/8skip。G3立即续接，唯一writer不变。
G3具名文件：products模块下product/application/feature/exposure/presentation/config/release/binding各资源的controller/service/repository（简单资源不建mapper）；products.module.ts注册。Manifest模块controller/service/repository/cache承担策略投影与双generation校验；公开模块Services提供投影数据，不deep-import Repository。先Product目录CRUD与失败路径，再App/Feature/Presentation、Config/Release/Binding与Manifest。测试新增test/integration/system-target-products.test.ts；现有G2隔离集成保留独立运行。

G6-Root-Smoke卡：Root唯一Root仓writer，基线Root36c9e779（后续并行commit可变）；范围scripts/e2e/run_system_owner_smoke.py、scripts/tests/test_system_owner_smoke.py，新增独立Agent调用脚本须先补范围。Root审查提交；依赖G1冻结artifact、System完整G5启动、BFF1e03b87、Agente24b4aa。只编排正常HTTP、不跨repo import；随机独立PG DB与System Redis namespace，复用infra、不FLUSHDB、仅drop自己创建资源。覆盖正式启动/readiness→BFFcatalog/manifest→Agent真实resolve；安全隔离unit先RED/GREEN，完整live待G5。System writer不修改Root脚本。
G6-BFF-dev子项：BFF同owner唯一writer，基线1e03b87；仅package/lock/test/docs修复Node22 pnpm dev对src .js specifier的ERR_MODULE_NOT_FOUND。采用精确tsx源码runner，不全量改import；Root验证提交，System writer不修改BFF。

G6补充Root实交付：BFF-dev 26eec0112c83ea98aa045896d385c89ad88b45d2，5文件package/lock/workspace/test/ACCEPTANCE，Node22 frozen install/lint/typecheck/build/test152pass，committed source-start2pass；前一consumer仍1e03b87。Root隔离smoke安全测试17pass，live仍待G5；Root topology机器cutover仅工作树准备，Model checkout/remote/历史保留、DB3空置，未冒称active退出验收。

### G3 行为与放置收敛

35 Products + 1 Manifest全部显式Nest方法；累计53业务操作+2 probes，生产main仍未cutover。新增Products八资源controller/service/repository及product-projection.service/repository；Manifest四具名文件（controller/service/repository/module），轻量缓存协调归ManifestService，复用CacheService，不为单例cache再加空层。HTTP新增forwarded-host.ts纯transport解析，SitesService公开resolveManifestSite返回本module对象；Manifest只用Sites/Products公开Services，不deep-import Repository。

配置选择：global→tenant→product→surface，global通用product_id NULL在product-specific之前；同scope中精确locale高于NULL，选中published release高于普通NULL release，再按version/id确定同identity次序。按module_key/config_key挑选有效项，集合按业务key合并；App presentation覆盖相应呈现项，未exposed/retired feature导航不可执行。完整缓存identity包含tenant/site/product/locale/surface与global/tenant两个generation；GET、投影前后及SET后复核，三次有界重试，poison/digest不符/Redis故障fail closed，TTL30s。

Config PATCH只改value、按存量module二次schema验证，CAS使用config_version并发出ETag；全局scope服务端固定，不从tenant伪装。Release validate重新校验内容schema/引用并计算canonical digest，修改validated release退draft，published配置保持不可变；retire同事务归档binding。绑定要求同tenant published release。删除Config/Binding/Exposure仅锁父存在，不要求Site active，创建/修改仍要求active。Site删除新增active surface Config反查与同父锁。

G3审查修复证据：发布优先级逆UUID先RED→GREEN；suspended Site清理Config/Binding/Exposure先RED409→GREEN并最终删Site；surface Config父锁两序，临时移除反查使测试RED（Site删200应409），恢复源码后验证。普通业务TDD按Product/App/Feature/Exposure/Presentation/Config/Release/Manifest逐项先404 RED后实现。测试只操作system_g3随机DB与namespace，未动共享服务或其他仓。

### G3 稳定交接与实际门禁（2026-09-08）

基线d057deb706a34129e23bec5ec1f70e235ca1d4ce；状态待Root审查/串行提交。System唯一writer停止写入；Root提交后立即续G4/G5完整范围，不以阶段结果结束总任务。
文件集合：当前git diff --name-only与git ls-files --others --exclude-standard，共40文件（38 TS + CURRENT/IMPLEMENTATION_PLAN）；没有package/schema/contract变化或任务外dirty。Sites两现有文件仅公开Manifest查询、Config反向引用；HTTP interceptor补config_version ETag；AppModule挂新模块，测试架构门扩到53操作。

- `TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm exec vitest run --no-file-parallelism test/integration/system-target-control.test.ts test/integration/system-target-products.test.ts test/architecture/system-target-boundary.test.ts test/unit/system-kernel.test.ts test/contract/system-target-contract.test.ts test/contract/proto-owner-boundary.test.ts` →6files/39pass/0skip。G3真实集成13项，包含所有36方法路径的真实Nest负向身份请求；G2集成7项保留。
- `pnpm typecheck && pnpm build && pnpm lint && pnpm contract:lint && pnpm verify:contract-provenance` →全部exit0；Redocly有效、83+2 frozen inventory、18source provenance不变。
- 本切片38个新增/修改TS `pnpm exec prettier --check <精确路径>` →全通过；git diff --check通过。
- `TEST_ADMIN_DATABASE_URL=postgresql://nako@localhost/postgres pnpm test` →30files：25pass/2fail/3skip；153tests：140pass/5既有fail/8旧integration skip。日志/tmp/system-g3-owner-all-tests.log。旧HTTP/全局四层测试仍待G5随cutover承接，不删除或放宽冒充全绿。
- schema未改，本轮集成各次均fresh应用canonicalSQL；本次未重新执行G1独立23项schema断言。Redis故障测试仅关闭本测试应用自己的client，不重启或破坏共享服务。

尚未交付：G4全部Model Catalog；G5生产main/旧树与Proto/SDK/libDOM退出、retention/reconciliation、完整startup/drain/观测/CI/smoke；Root G6真实消费者联调。现有测试证明当前切片，不宣称完整生产验收。

### G3 Root 稳定树复验与放行

Root在d057deb+交接40文件复跑6files/39pass/0skip（真实独立PG/Redis）；typecheck/build/lint/Redocly/drift/18source provenance全部通过；38TS格式与diff check通过。全量140pass/5既有fail/8旧skip，日志/tmp/kokoro-system-g3-root-all.log。独立system_capability_review静态复查三项P2均关闭、未见新增P1/P2。Root串行提交后同负责人立即继续G4/G5，不以此宣布完整完成。
Root隔离跨仓smoke单测20pass，与topology/governance合计59pass；BFF真实源码启动+fresh PG/Redis readiness已通过，但完整System消费者smoke仍待G5。

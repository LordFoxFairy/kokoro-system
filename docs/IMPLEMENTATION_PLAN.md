# System G0 设计定稿与实施准备计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development or superpowers:executing-plans for authorized tasks. 本计划只授权 G0 文档准备；G1 及业务实施必须先满足阶段门。步骤用 checkbox 跟踪。

**Goal:** 将已讨论的 System 能力边界、选型未决项与验证依赖落为唯一可交接任务表，不抢跑源码重构。

**Architecture:** 主控拥有整体架构与跨仓裁决；System 单一 writer，独立 Agent 只读审查。使用本仓现有技术/API/数据文档，不建立另一份 System spec 真源。旧实现与推荐目标明确分开。

**Tech Stack:** 本轮 Markdown、Git、Python 标准库链接检查及现有 pnpm/Vitest 门禁；业务候选见 TECHNICAL_DESIGN G0，尚未安装或冻结。

## 0. 基线与范围

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
| G0-01 / P0 | 固定事实、文档门未决项、候选目录，不把推荐当已实现 | Root / system_g0_review / 唯一文档 writer | 上述七文件；依赖已读规范及源码盘点 | 待集成验证；Root 串行提交 |
| G0-RPC / P0 | 列出现存 Site/Model 协议的生产/测试/历史消费者，识别 ADR 约束 | system_protocol_inventory，gpt-5.6-sol / Root / 只读 | System/Model/BFF/Agent contract 与 src，禁止更改 | 已验收（静态盘点）；无写入/提交 |
| G0-REVIEW / P0 | 复核 G0 文档对用户纠正、当前事实和目标的表达一致性 | system_g0_review，gpt-5.6-sol / Root / 只读 | G0-01 七文件；依赖 draft 完成 | 已验收；无写入/提交 |
| G0-VERIFY / P0 | 主仓重跑差异/链接/现有门禁，记录通过与未跑原因 | Root / 独立审查建议 / 验证 | 文档工作树；不跑 schema 安装或共享数据测试 | 待集成验证；Root 提交后复验 |

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
- [ ] 按七个明确路径暂存、检查 staged diff，提交一个自洽文档准备切片。
- [ ] 在 committed HEAD 重跑相关检查，验证 System 工作树干净，更新本表证据。

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

## 2. G1 设计门任务队列（尚未授权源码实施）

| 顺序 | 必须形成的决定/证据 | 后续 owner |
|---|---|---|
| G1-A | Site/Product/App/Feature/Workspace 用例与身份边界；配置直接生效还是需发布快照；不为旧表保留无用能力 | Root + System 负责人 |
| G1-B | HTTP/RPC 消费者清单；Zod/OpenAPI 来源选择；availability 概念边界与物理粒度对齐 ADR-029；若改变已接受边界先修订 ADR-0002/ADR-029，发布 immutable artifact 清单 | Root 跨仓裁决，System owner |
| G1-C | Node/Nest/adapter/schema/ORM/Redis 精确版本、官方维护/许可/peer/安全证据；编译/装配 spike 必须单独批准文件集 | System 负责人 |
| G1-D | 确定唯一 schema、资源字段/状态/事务/锁/索引/retention；目标 machine contract 与 schema 一致性验证 | System 负责人 |
| G1-E | 更新技术/API/数据文档为同一目标版本，列绝对路径、当前 commit、未决项和验证输出；Root 放行 | Root |

在 G1 中只有设计已确定的机器契约/schema 才可进入独立明确授权任务；
本表不授权 worker 自行改表、删除旧库、安装依赖或批量重写源码。

## 3. 实现顺序草案（不是可直接执行的任务卡）

1. Nest 进程内核与技术组件；先建立旧行为基线和架构断言，再替换装配。
2. Sites 纵向切片：API/规则/持久化/测试一起交付。
3. Products 与配置生效用例；Manifest 同步承接身份、策略、缓存一致性。
4. Workspace 仅按已批准消费者用例实施，不复制组织/Project。
5. Model 独立 cutover：owner contract → System 模块/唯一数据栈 → 消费者 → 删除旧运行身份与路径 → 集成验收。

每片开工前补充准确文件集、RED/GREEN 测试命令、提交责任和隔离资源。
同仓单 writer；跨仓 owner/consumer 串行，独立只读审查并行。通用 lint/typecheck/test/build、
fresh schema、真实 integration、contract/architecture/smoke 都必须在实现交付主仓重跑。

## 4. 当前未决与交接

- 业务配置发布需求尚未定稿，独立 releases 不预建。
- Site/Model RPC 去留与外部消费者待证据裁决，生成路径随最终协议确定。
- BFF 当前两个 owner HTTP 路径缺 /v1；需 BFF 负责人后续修复并与 owner 做真实 integration，当前不宣称链路已通。
- 数据访问栈/精确版本未冻结；现有 pg/Prisma 正确性保障不得因统一目录而丢失。
- Workspace 扩展与 execution Runtime profile 尚无明确消费者用例。
- IAM 未交付内部 AuthZ/SDK 不作为当前可用依赖。
- SQL 手册基于 Root 已有未提交版本，规范归档由 Root 后续处理，本轮不夹带提交。

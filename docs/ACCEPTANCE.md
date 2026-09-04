# kokoro-system 验收矩阵

状态：Phase 1 工程治理与当前 runtime 的可执行验收，2026-09-03。每次结论必须绑定当前 commit、命令、exit code 和
依赖环境；本文件中的“预期”不是历史或生产通过证明。

## 1. Phase 1 完成条件

| ID | 验收项 | 自动证据 | 预期 |
|---|---|---|---|
| GOV-01 | 精确大小写的 canonical README/INDEX/CURRENT/TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL/SECURITY/RELIABILITY/ACCEPTANCE/SLO/RUNBOOK 存在 | architecture test + Root slice | 无缺失 |
| GOV-02 | `docs/ADR/` 至少有一个 accepted ADR，旧 lowercase/duplicate docs 不存在 | architecture test | 通过 |
| GOV-03 | `contract/README.md` 含 owner/visibility/version/generation/breaking/provenance/consumer workflow | architecture + Root slice | 通过 |
| GOV-04 | 每个 direct/reusable OpenAPI operation 有 5 个 governance extensions | contract test + verifier + Root slice | 通过 |
| GOV-05 | 顶层 tsconfig 显式 `useUnknownInCatchVariables=true` | architecture + Root slice + typecheck | 通过 |
| GOV-06 | Generated、runtime、Schema 与跨仓文件未手改 | `git diff` scope review | 只含治理文件/test/verifier/config |
| GOV-07 | lint/typecheck/test/build/contract 均在 committed tree 重跑 | 第 5 节 | 全部 exit 0 |

## 2. Runtime behavior matrix

| ID | 行为 | 当前自动证据 |
|---|---|---|
| SYS-01 | Site、Workspace、Policy、Config、Release application happy path | `test/system-control.test.ts` |
| SYS-02 | tenant A/B 的 Site/Workspace/Config/Policy/Manifest/Redis key 隔离 | system-control/runtime-manifest/runtime smoke |
| SYS-03 | tenant + Host 在业务数据/cache 读取前验证 | runtime-manifest、HTTP、Connect、real smoke |
| SYS-04 | runtime/control/Connect 要求 BFF service auth，probe 公开 | HTTP/Connect tests |
| SYS-05 | read/write/publish permission 边界 | system-control + HTTP control tests |
| SYS-06 | JSON 未声明字段、错误类型、缺 header/query、非法 cursor 被拒绝 | HTTP control/server tests |
| SYS-07 | 同 key/hash replay，同 key不同 hash 409 | system-control + PostgreSQL concurrency |
| SYS-08 | 同 key 并发只产生一条 Site/Host/receipt | `pnpm test:postgres-concurrency` |
| SYS-09 | release 只按 draft->validated->published->retired 前进 | system-control tests |
| SYS-10 | Config precedence：surface/tenant/product/global、locale、release、version | postgres repository + runtime smoke |
| SYS-11 | Redis/PostgreSQL failure fail closed，恢复后可再次读取 | failure-recovery tests |
| SYS-12 | malformed Redis/PostgreSQL value 不以 assertion 穿透 boundary | boundary decoder + architecture tests |
| SYS-13 | health/readiness/request id/envelope 与 structured log | HTTP/structured logging tests |
| SYS-14 | Connect handler 来自 generated SiteService descriptor | Site Connect + real smoke |
| SYS-15 | shutdown 总 deadline 与正常关闭 | shutdown tests |
| SYS-16 | canonical schema 使用 UTC、CHECK/UNIQUE 命名、无 FK/migration | schema + architecture + Root slice |

## 3. Contract acceptance

```bash
pnpm contract:lint
pnpm contract:generate
pnpm verify:contract-provenance
pnpm test:contract
pnpm contract:check
```

验收时检查：

- OpenAPI 3.1、仅显式 V1/Probe path、snake_case、common envelope；
- 13 个 direct/reusable operation definition 的治理 metadata；
- Buf lint；
- proto source digest 与 `contract/provenance.json` 一致；
- `src/generated/proto/` 只由 generator 产生，无手工修改。

**未自动证明**：OpenAPI semantic breaking diff、proto 对固定上一版本的 `buf breaking`、OpenAPI/generated digest、source
commit provenance、发布后的 consumer compatibility。详见 [`../contract/README.md`](../contract/README.md)。

## 4. Real-infrastructure prerequisites

- 复用 Root 已有 PostgreSQL 与 Redis，不启动仓库私有依赖。
- Redis URL 使用 logical DB 2。
- Base PostgreSQL 账号可创建/删除隔离测试 database；并发测试使用已安装 canonical schema 的 base database。
- 不对包含业务数据的 database 运行 `pnpm db:apply-schema`；该命令发现任意现有 table 会失败。

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:55433/kokoro_system_test'
export TEST_REDIS_URL='redis://127.0.0.1:56380/2'

pnpm db:apply-schema
pnpm test:runtime-real-system
pnpm test:integration
```

`test:runtime-smoke`/`test:runtime-real-system` 创建并删除带随机名的隔离 database，使用进程唯一 Redis namespace；
`test:postgres-concurrency` 在 base database 写入随机 tenant fixture 并在 finally 清理。

## 5. Required local gate

在 `kokoro-system` 当前 committed tree：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contract:check
git diff --check
git status --short --branch
```

Phase 1 因未修改 proto，`pnpm contract:check` 后还要求：

```bash
git diff --exit-code HEAD -- src/generated/proto
git diff --exit-code HEAD -- database/schema.sql src/application src/domain src/infrastructure src/interfaces src/bootstrap src/config src/main.ts src/index.ts
```

第二条允许 `tsconfig.json`、tests、contract/verifier 与 docs 改动，但不允许 runtime/Schema diff。

## 6. Root 十仓静态审计的本仓切片

从 Root `/Users/nako/WebstormProjects/github/thefoxfairy/Kokoro` 执行：

```bash
python3 - <<'PY'
from scripts.governance.repository_checks import check_common
from scripts.governance.delivery_checks import check_delivery
from scripts.governance.typescript_checks import check_typescript

failures = []
check_common("kokoro-system", failures)
check_delivery("kokoro-system", failures)
check_typescript("kokoro-system", failures)
for failure in sorted(failures, key=lambda item: (item.rule, item.detail)):
    print(f"[{failure.repository}] {failure.rule}: {failure.detail}")
print(f"violation_count={len(failures)}")
raise SystemExit(1 if failures else 0)
PY
```

预期 `violation_count=0`。这只是结构性审计，不替代本仓 lint/typecheck/test/build/contract/integration。

## 7. Production candidate gate

CI/tag release workflow 定义了 schema、unit、real integration、source scan、image build/smoke/scan、SBOM、provenance 与
attestation。手工复现 image smoke：

```bash
IMAGE_TAG=kokoro-system:release-smoke \
  bash scripts/test/production-image-smoke.sh
```

需要 Docker 以及容器可访问的 `DATABASE_URL`/`REDIS_URL`。生产候选验收必须保存 commit、workflow run、image immutable
digest、scanner result、SBOM/attestation 和 smoke output。

## 8. 明确未验收

以下项目仍是缺口，不因本阶段通过而改变：

- Product/Profile/Release Binding 的完整 application/API 生命周期与发布后 cache invalidation；
- Config foreign-reference/schema validation、不同 key 并发唯一性、Policy enforcement；
- 生产 TLS/network policy/secret rotation、rate limit、capacity/load/failover/restore exercise；
- metrics/traces/dashboard/alerts 与 30 天 SLI/SLO；
- OpenAPI breaking/provenance/consumer artifact 自动化；
- `server.ts` 400 行评审项与 SDK compatibility alias 清理。

# kokoro-system

**G1过渡工作树：目标contract/schema已先行，旧业务尚未替换，不作为可部署版本；以下启动命令待G2承接，勿对已有数据库应用schema。**

`kokoro-system` 是 Kokoro 的 System owner，负责 Site、Host、Workspace、Runtime Manifest、System Config、
Config Release、Release Binding 与 System Policy 事实。它是内部服务，不是浏览器 API；调用方向固定为
`Browser -> Web same-origin adapter -> BFF -> System`。

当前实现、目标状态和已知缺口见 [`docs/CURRENT.md`](docs/CURRENT.md)。代码与文档入口见
[`INDEX.md`](INDEX.md) 和 [`docs/INDEX.md`](docs/INDEX.md)。字段级 HTTP/Connect 事实源位于
[`contract/`](contract/README.md)，数据库事实源是 [`database/schema.sql`](database/schema.sql)。

## Owner 边界

**已实现**

- PostgreSQL 保存 System-owned durable facts 与 tenant manifest generation；Redis logical DB 2 只用于带 generation fence 的
  Runtime Manifest 热缓存和可回收副本。
- System 通过 `tenant_id + normalized host` 查询本仓 Site/Host，既不读取 IAM 数据库，也不调用 IAM Host API。
- `/v1/system/*` 与 SiteService Connect RPC 要求 `web-bff` service identity 和共享 service token；
  `/healthz`、`/readyz` 保持公开。
- Control-plane 权限来自通过服务认证后的受信上下文：`system:read`、`system:write`、`system:publish`。
- Mutation 使用 tenant-scoped `Idempotency-Key` receipt；release 只允许
  `draft -> validated -> published -> retired`。
- publish/retire 在同一 PostgreSQL transaction 推进 tenant manifest generation，再清理 Redis；并发 miss 通过写后 fence
  丢弃旧 generation，进程崩溃或旧 cache namespace 不会把旧 manifest 重新变成当前事实。
- Config 只可写入 caller tenant 的 `draft`/`validated` release；HTTP 中所有 PostgreSQL `BIGINT` response 均使用十进制字符串。

**不属于本仓**

- IAM 的 Tenant、Identity、AuthN/AuthZ、Role、Permission 与 Audit 事实；
- BFF 的 Conversation、Message、Share、Project、ScheduledTask 与 public Product API；
- Billing、Capability、Storage、Agent 或 Scheduler 的业务事实；Model目标按ADR031合入，当前仍独立运行；
- 浏览器 session、CSRF admission、服务发现、TLS 终止与生产 secret 分发。

## 五分钟本地启动

前置条件：Node.js `>=24 <25`、`pnpm@12.3.4`、共享 PostgreSQL 16+、共享 Redis 7。System 使用独立
PostgreSQL database/schema 与 Redis logical DB 2；不要为本仓重复启动一套依赖。

```bash
pnpm install --frozen-lockfile

export DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:55433/kokoro_worker_system'
export REDIS_URL='redis://127.0.0.1:56380/2'
export KOKORO_SYSTEM_BFF_SERVICE_TOKEN='LOCAL_SYSTEM_BFF_TOKEN'

# 只允许空数据库；它不是 migration 或 drift repair。
pnpm db:apply-schema
pnpm dev
```

默认监听 `127.0.0.1:4240`。源码启动后检查：

```bash
curl -fsS http://127.0.0.1:4240/healthz
curl -fsS http://127.0.0.1:4240/readyz
```

`KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 在解析层是可选配置，但运行业务 surface 时是必需的；缺失时业务路由以
`service_auth_not_configured` fail closed。完整环境变量见 [`.env.example`](.env.example)，故障排查见
[`docs/RUNBOOK.md`](docs/RUNBOOK.md)。

## 验证

不依赖外部基础设施的基础门禁：

```bash
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

真实基础设施门禁需要 `TEST_DATABASE_URL`/`DATABASE_URL`、`TEST_REDIS_URL`/`REDIS_URL`，且数据库账号能够
创建和删除隔离测试数据库：

```bash
pnpm db:apply-schema
pnpm test:runtime-real-system
pnpm test:integration
```

命令结果只证明执行时的 checkout 和本地/CI 环境，不代表生产 SLO、容量、安全评估或灾备演练已达标。

## Contract 与 generated code

```bash
pnpm contract:lint
pnpm contract:generate
pnpm verify:contract-provenance
pnpm contract:check
```

目标HTTP字段source是src/modules/*/schemas/*.schema.ts，contract/openapi/system.openapi.json只读生成；contract/proto/仅旧运行基线待移除。
`src/generated/proto/` 只能由 Buf/protoc 插件生成，禁止手改。版本、breaking policy、provenance 限制与 consumer
升级步骤见 [`contract/README.md`](contract/README.md)。

## Production image

```bash
docker build -t kokoro-system:local .
docker run --rm -p 127.0.0.1:4240:4240 \
  -e DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB' \
  -e REDIS_URL='redis://HOST:6379/2' \
  -e KOKORO_SYSTEM_BFF_SERVICE_TOKEN='TOKEN' \
  -e KOKORO_SYSTEM_HOST='0.0.0.0' \
  kokoro-system:local
```

镜像以非 root `node` 用户运行，入口为 `node dist/main.js`，`HEALTHCHECK` 调用 `/readyz`。Tag release workflow
构建并 smoke/scan 本地候选镜像后才推送，并请求 SBOM、max provenance 与 digest attestation；是否在某次远端运行中
成功，以该 workflow run 的证据为准。

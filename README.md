# kokoro-system

Kokoro 内部控制面：Site/域名/Policy、Workspace、Product/App/Feature、配置发布与 Runtime Manifest、模型目录与可执行路由。只返回路由，不执行推理、不拥有价格、IAM 或 BFF 公共 API。

当前实现：Node **24.13.0**、pnpm **12.3.4**、Nest **12.0.1** Express、Zod→OpenAPI、PostgreSQL SQL-first、Redis。83 业务操作与 2 probes；唯一入口 `src/main.ts`。阶段证据及未验项见 [CURRENT](docs/CURRENT.md)、[ACCEPTANCE](docs/ACCEPTANCE.md)。

## 本地源码启动

复用既有 PostgreSQL/Redis，本地/CI 共享应用数据库与 role；为 System 显式选择独立 owner schema，不覆盖已有数据。URL 必须包含唯一 `schema=system`（也可选其他安全 owner 名），禁止 `public`、`pg_` 和 URL `options`/应用连接配置覆盖；TLS 参数保留，时间为 UTC。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
# 填入本机独立 DATABASE_URL、REDIS_URL 与三个不同随机 service token
set -a; source .env; set +a
pnpm db:apply-schema  # 仅目标 owner schema 为空；其他 owner 非空允许
pnpm dev
```

`GET /healthz` 为进程存活，`GET /readyz` 检查本仓 PG/Redis，包括配置 namespace 存在、实际 current_schema 和 UTC。运行时不创建 schema 或 fallback public。默认 `127.0.0.1:4240`；容器外部访问显式设置 HOST。业务请求需可信 service 身份；字段以 [只读 HTTP contract](contract/README.md) 为准，无 RPC/SDK 第二协议。

## 完整本仓门禁

```bash
export TEST_ADMIN_DATABASE_URL='postgresql://USER@localhost/postgres'
export TEST_REDIS_URL='redis://localhost:6379/2'
pnpm verify
```

测试创建/删除自己随机命名数据库，不清共享 Redis；namespace 中 cache 自然 TTL 回收。缺配置不跳过。`pnpm test:unit` 不依赖外部服务；`pnpm test:integration` 需要真实 PG/Redis。

镜像 RC：`docker build -t kokoro-system:rc .`，随后 `SYSTEM_SMOKE_IMAGE=kokoro-system:rc pnpm exec tsx scripts/system-runtime-smoke.ts --image`（Linux host network，独立数据库/namespace）。本机 Docker daemon 当前异常，RC 实跑仍未验；不把 CI 配置当执行结果。

代码地图 [INDEX](INDEX.md)，运行维护 [RUNBOOK](docs/RUNBOOK.md)，唯一完整任务表 [IMPLEMENTATION_PLAN](docs/IMPLEMENTATION_PLAN.md)。

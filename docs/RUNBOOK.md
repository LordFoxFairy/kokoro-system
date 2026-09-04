# kokoro-system Runbook

状态：当前本地/部署诊断步骤，2026-09-03。命令默认在本仓根目录执行。生产编排、TLS、secret store、backup restore 和
on-call routing 属于外部平台；仓库当前没有这些环境的已验证操作证据。

## 1. 配置清单

| Variable | Required | Default/role |
|---|---:|---|
| `DATABASE_URL` | 是 | System 独立 PostgreSQL database/schema；PostgreSQL URL only |
| `REDIS_URL` | 是 | 共享 Redis logical DB 2 |
| `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` | 业务流量是 | 无默认；缺失时业务 route fail closed |
| `KOKORO_SYSTEM_HOST` | 否 | `127.0.0.1`；container 通常设 `0.0.0.0` |
| `KOKORO_SYSTEM_PORT` | 否 | `4240` |
| `KOKORO_SYSTEM_REDIS_NAMESPACE` | 否 | `kokoro:system` |
| `KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS` | 否 | `10000`，正整数 |

不要执行会打印完整环境的诊断命令；URL/token 不进入 issue、chat、shell trace 或日志摘录。

## 2. 本地依赖探测

复用 Root 共享 PostgreSQL/Redis，不创建仓库私有 compose：

```bash
pg_isready -d "$DATABASE_URL"
redis-cli -u "$REDIS_URL" PING
```

预期 PostgreSQL accepting connections、Redis `PONG`。确认 `REDIS_URL` path 为 `/2`。`db:apply-schema` 只用于全新、
空的 System database：

```bash
pnpm install --frozen-lockfile
pnpm db:apply-schema
```

若报 `requires a blank database; found tables`，停止；不要把它当 migration 重跑或删除未知表。选择新的空 database，或按
平台恢复/重建流程处理现有数据。

## 3. 启动与 probe

```bash
pnpm dev
```

或验证 compiled entry：

```bash
pnpm build
pnpm start
```

另一个终端：

```bash
curl -fsS http://127.0.0.1:4240/healthz
curl -fsS http://127.0.0.1:4240/readyz
```

预期：

```json
{"data":{"status":"ok","service":"kokoro-system"},"meta":{"request_id":"..."}}
{"data":{"status":"ready","service":"kokoro-system"},"meta":{"request_id":"..."}}
```

受保护的 Runtime Manifest 示例：

```bash
curl -fsS 'http://127.0.0.1:4240/v1/system/runtime-manifest?product_id=admin&locale=en-US' \
  -H 'Forwarded: host=tenant.example.test' \
  -H 'x-kokoro-service: web-bff' \
  -H "Authorization: Bearer $KOKORO_SYSTEM_BFF_SERVICE_TOKEN" \
  -H 'x-kokoro-tenant-id: TENANT_ID' \
  -H 'x-kokoro-request-id: 00000000-0000-4000-8000-000000000001'
```

Site/Host/Product/Config fixture 必须已存在；Product 不存在会返回 empty manifest，Host mismatch 返回 404。

## 4. Verification

基础门禁：

```bash
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

真实依赖：

```bash
export TEST_DATABASE_URL="$DATABASE_URL"
export TEST_REDIS_URL="$REDIS_URL"
pnpm test:runtime-real-system
pnpm test:integration
```

Runtime smoke 创建/删除隔离 database，需要 CREATEDB；PostgreSQL concurrency 使用已装 schema 的 base database。命令和
验收边界见 [`ACCEPTANCE.md`](ACCEPTANCE.md)。

## 5. 快速诊断表

| Symptom/code | 检查 | 处理 |
|---|---|---|
| startup 在 listen 前失败 | Redis PING、URL scheme、structured `service.start` error | 恢复 Redis/修正 secret source 后重启 |
| `/healthz` 失败 | process/container/listener/port | 查看 lifecycle log；替换实例 |
| `/healthz` 200、`/readyz` 503 | PostgreSQL `SELECT 1`、Redis PING、pool/ACL/DNS | 先摘流量，恢复依赖，等待 readiness 200 |
| `service_auth_not_configured` | token 是否注入且非空 | 修复 secret deployment；不要关闭 guard |
| `service_auth_failed` | service identity、credential、BFF secret version | 校验 BFF/System secret一致；调查伪造/泄漏 |
| `FORBIDDEN` | `x-kokoro-iam-permissions` 与 operation | 在 BFF/IAM admission 修复；不要直接放宽 System |
| Runtime 404 | tenant、Forwarded/Host、active Site/Host | 修复可信 Host 或本仓 Site/Host lifecycle |
| Runtime 503 | DB/Redis、cache decode/identity、generation 连续变化、row decoder | 用 request/trace id 定位；检查 dependency、tenant generation 与 namespace key |
| `INVALID_CURSOR` | cursor 是否原样来自上一页 | 丢弃自建 cursor，从第一页重试 |
| `IDEMPOTENCY_KEY_REUSED` | 同 key 是否绑定不同 payload/operation | 原 payload 重放或为新 command 生成新 key |
| `INVALID_STATE` | release 当前状态 | 只执行下一合法 transition |
| shutdown deadline exceeded | listener/DB/Redis closer、平台 grace period | 替换实例，调查 hanging dependency；增大值前先取证 |

## 6. Redis incident

1. 将 not-ready 实例从流量摘除；确认 PostgreSQL facts 不受影响。
2. 检查 `redis-cli -u "$REDIS_URL" PING`、DNS/ACL、logical DB 与 namespace。
3. 仅列出 System namespace，避免 `FLUSHDB`/`FLUSHALL`：

```bash
redis-cli -u "$REDIS_URL" --scan \
  --pattern "${KOKORO_SYSTEM_REDIS_NAMESPACE:-kokoro:system}:manifest:*"
```

4. key 使用 `manifest:v2:tenant:<base64url>:generation:<decimal>:...:surface:<none|value:base64url>`；不要把编码 segment
   当成原始 tenant/surface。对 malformed/identity-mismatch key，先记录 key name、request id、发生时间（不记录 value 中的敏感内容），经 owner 审核后
   对明确 key 使用 `UNLINK`；不要批量删除未审查 namespace。
5. Redis 恢复后等待 `/readyz` 200，再用两个 tenant/surface 请求验证隔离和重新填充。

Runtime 当前不会在 Redis 故障时绕过 cache；不要临时增加进程内 fallback。

## 7. PostgreSQL incident

1. 摘除 not-ready 实例，检查 database endpoint、role/ACL、pool exhaustion、statement/query timeout 和 provider event。
2. 使用只读查询确认连接与目标 database/schema；不要在事故中运行 `db:apply-schema`、手改 status 或删除 receipt。
3. 恢复连接后，`/readyz` 必须 200；再验证 SiteService 与 Runtime Manifest。
4. 若怀疑数据损坏，停止 mutation，按平台 PITR/restore 流程恢复到隔离 database并运行 schema/contract/smoke；仓库当前没有
   自带 restore automation 或已记录 RPO/RTO 演练。

## 8. Release/config incident

- Release transition 只能向前；不要直接把 retired/published 状态改回去。
- 错误配置应通过新的 idempotent config/release command 修正，而不是改历史 receipt。
- 当前 publish 不建立 Release Binding；若 incident 涉及 binding，先冻结发布并由 System owner 按 [`CURRENT.md`](CURRENT.md)
  的已知缺口处理，不能假设 API 已提供完整回滚。
- publish/retire 会在 PostgreSQL transaction 内推进 tenant generation，并在 commit 后清理当前 Redis namespace。检查
  `system_runtime_manifest_generation`、release/binding/config facts 和 generation key；30 秒 TTL 只是容量回收，不是发布
  原子性保证。旧 deployment namespace 的旧 generation key 可以留待 TTL，但当前 generation 请求不得命中它。
- Config 若引用 release，只有同 tenant `draft`/`validated` 可写；不要通过 SQL 把 published/retired release 改回可写状态。

## 9. Code/image rollback

当前 canonical Schema 含 `system_runtime_manifest_generation`，没有 down migration。一般 code rollback：

1. 记录当前 commit、immutable image digest、deployment、request/trace IDs。
2. 将流量切回已验证的前一 immutable image；不要使用 mutable tag 作为唯一证据。
3. 等待前一 image `/readyz` 200，执行 probe + 最小受保护请求。
4. 保留失败 image/log/scanner/attestation 供复盘。

V1 canonical schema 没有 down migration。任何 future schema change 都必须采用 clean database/rebuild policy 或先由 owner 定义
独立数据迁移方案；当前 runbook 不声称支持原地 schema rollback。

## 10. Security incident

发现 credential 泄漏、cross-tenant、异常 Host/permission 或敏感输出时：

1. 立即隔离受影响 caller/instance，暂停 control-plane mutation。
2. 在外部 secret manager 轮换 BFF/System token并同步部署；当前单 token 无双 key窗口，需协调切换。
3. 保存脱敏 request_id、trace_id、operation、timestamp、commit/image digest 与 deployment evidence。
4. 检查 BFF header stripping、ingress/network policy、System service-auth failures 和 tenant/Host records。
5. 不把 token、connection URL、完整 payload/cache value 放入 ticket 或仓库。

## 11. Evidence 与升级

升级给 System owner 时附：UTC 时间、环境、commit/image digest、operation、status/code、request/trace id、dependency probe、
最近 release、可复现步骤与已执行处置。Owner roster、pager route、dashboard 和 provider-specific restore link 尚未进入仓库，
由部署平台补齐后应从本节链接，不应写虚构联系人。

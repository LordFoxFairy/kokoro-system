# kokoro-system 安全设计

状态：当前控制与缺口，2026-09-03。本文不声称已完成生产渗透测试、合规认证、secret 轮换演练或攻击面评估。

## 1. Trust boundary

```text
Untrusted browser/input
  -> Web/BFF boundary: session + CSRF + IAM admission + request normalization
  -> authenticated server hop: web-bff identity + System service token
  -> kokoro-system: tenant/permission/Host validation
  -> System-owned PostgreSQL + Redis DB 2
```

System 不接受浏览器直接提供的 tenant/permission 作为事实，也不验证终端用户 IAM token。它只在
`requireBffServiceAuth` 成功后消费 BFF 构造的 tenant、actor、organization、permission 和 Host context。因此生产网络
必须阻止绕过 BFF 的任意 caller 到达业务端口；TLS/mTLS、ingress、service mesh 与 secret delivery 是外部前置。

## 2. Authentication 与 authorization

**已实现**

- 所有 `/v1/system/*` 和 SiteService Connect request 要求 `x-kokoro-service=web-bff`。
- Credential 可来自 `x-kokoro-internal-secret` 或 Bearer；比较使用相同长度 Buffer 的 `timingSafeEqual`。
- Token 缺少配置时不是“关闭认证”，而是业务 route 返回 503；错误 token/identity 返回 403。
- `/healthz`、`/readyz` 不需要 credential，且只返回 service/status/request id。
- Control-plane application 检查 permission snapshot；global config 需要 write + publish。
- Runtime Manifest 不检查 IAM permission key，但要求 service auth、tenant 和匹配的 active Site Host。

**缺口**

- 单一静态共享 token 没有 key id、到期时间、双 key rotation 或 workload identity/mTLS。
- Permission CSV 未带独立签名/issuer/audience；其可信度完全依赖 service token 与网络边界。
- 没有 rate limit、quota、caller-specific policy 或异常认证指标 exporter。
- System 没有 authorization decision audit writer；Schema 中 audit table 未被 runtime 使用，其与 IAM Audit owner 的边界尚待确认。

## 3. Tenant 与 Host isolation

**已实现**

- `tenant_id` 来自 header，不从 JSON body/query 派生。
- Manifest 在读 Redis/config 之前，以 tenant + normalized Host 查询 active Site/Host。
- Host normalization 拒绝控制字符、userinfo、path、query、fragment、wildcard，转小写并去尾随点。
- Runtime cache key 包含 tenant/product/locale/surface；cache hit 复核 tenant/product/locale identity。
- Site/Workspace/Policy repositories 使用 tenant predicate；同 owner JOIN 同时约束 tenant 与 resource ID。
- Tests 覆盖 forged tenant、Host mismatch、tenant cache isolation 与跨 tenant control data。

**外部前置**：BFF/反向代理必须移除浏览器自带的内部 `x-kokoro-*` headers，并重新构造可信 `Forwarded`/Host；System
当前取 Forwarded 第一项，没有验证代理签名或 hop allow-list。

## 4. Input、output 与 injection control

- HTTP JSON body 必须是 object，未声明字段被拒绝；string/array/boolean/schema version/scope 做显式类型检查。
- 当前 body cap 为 1,000,000 bytes，但完整读入后才检查；需要 streaming early limit 才能完整控制内存压力。
- PostgreSQL runtime SQL 使用 `$1...` 参数绑定；动态数据库名只存在隔离测试脚本且经过 identifier quoting。
- Redis/PostgreSQL 外部值从 `unknown` 经过 enum/string/JSON/time decoder；invalid cache/row fail closed。
- Response 使用明确 wire mapper；unexpected errors 统一成 503，不返回 stack、SQL、URL 或 secret。
- Server-only SDK 对 error details 只保留合法稳定 code，丢弃 provider URL、token、password 等未知字段。

**缺口**：SDK/HTTP server 没有 response/request streaming byte budget、content-type allow-list、header count/size、显式
headers/request timeout 或 per-route complexity limit；Config `value` 也没有 schema registry validator。

## 5. Secret 与日志

- `DATABASE_URL`、`REDIS_URL`、`KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 只从环境读取；`.env*` 默认忽略，仅提交脱敏 example。
- 结构化日志只包含 service/operation/request_id/trace_id/result/duration 和可选 error class name，不记录 body、token、
  connection URL、SQL 或 Redis value。
- Service-auth error message 稳定，不区分 identity/header/token 哪一项错误。
- Docker runtime 是非 root `node`；base image 使用 sha256 digest。

**外部前置**：生产 secret store、encryption at rest、database role、network ACL、certificate、rotation 和 log retention 由
部署平台提供。仓库当前没有证明这些控制已在任何环境启用。

## 6. Supply-chain controls

**已实现于 workflow 定义**

- pnpm/version/lockfile 固定；Docker install 使用 `--ignore-scripts`。
- GitHub Actions 第三方 action 固定完整 commit SHA。
- CI 用 Trivy 对 source/dependency/secret/misconfiguration 做 HIGH/CRITICAL 阻断扫描。
- Tag release 在 push 前构建、smoke、扫描本地 candidate；publish 请求 SBOM、max provenance 与 digest attestation。

某次发布是否实际通过，必须引用对应 GitHub workflow run、image digest 和 attestation；仅有 YAML 不构成发布证据。

## 7. Threat/control register

| Threat | 当前控制 | 剩余风险/后续 owner |
|---|---|---|
| Caller 伪造 tenant/permission | BFF service token + identity；application tenant predicates | Token 泄漏或网络绕过可伪造；平台需 mTLS/network policy/rotation |
| Host header confusion | 严格 normalize + tenant/Site lookup | 代理必须清洗 Forwarded；尚无 trusted-hop policy |
| SQL injection | 参数绑定、无 transport SQL | 持续用 architecture test 阻断动态 runtime SQL |
| Cross-tenant cache | tenant/surface key + identity check | Surface 只由 key 隔离；需指标与 invalidation tests |
| Malformed DB/Redis payload | runtime decoder，fail closed | 可造成 availability 失败；需告警与数据修复 runbook |
| Oversized request/slow client | 1 MB post-buffer check | 需 streaming limit、server timeout、并发/load shedding |
| Replay/duplicate mutation | tenant key/hash receipt + transaction lock | Key hash未含 operation；caller 必须 tenant 全局唯一 |
| Secret leakage in error/log | generic wire error、structured metadata-only log、SDK sanitize | 外部代理/平台日志仍需独立审计 |
| Dependency/image compromise | lockfile、digest base、scan、SBOM/attestation workflow | 无仓内签名验证 policy/依赖 allow-list 证据 |

## 8. Security verification

本地可复现：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm contract:check
```

真实 PostgreSQL/Redis：

```bash
pnpm test:runtime-real-system
pnpm test:integration
```

Production candidate：

```bash
SKIP_IMAGE_BUILD=false IMAGE_TAG=kokoro-system:security-smoke \
  bash scripts/test/production-image-smoke.sh
```

最后一项需要 Docker 与已配置的共享 PostgreSQL/Redis。任何“已安全/已合规”结论还需要外部 threat model review、
credential rotation、network/TLS verification、scanner report、image digest、attestation 和 incident exercise evidence。

## 9. 安全事件入口

Credential、cross-tenant、unexpected data exposure 或 supply-chain 事件按 [`RUNBOOK.md`](RUNBOOK.md) 的安全事件流程处理；
先隔离流量/轮换外部 secret，再保全 request/trace/workflow/image digest 证据。不要把 credential 或敏感 payload 写入 issue、
chat、日志摘录或本仓 fixture。

# kokoro-system 验收清单

| 类别 | 验收 |
|---|---|
| 正向 | Site、Workspace、Policy、Config、Release 创建和 manifest 读取 |
| 负向 | 缺 tenant/product/body/idempotency、非法 cursor、未知资源、非法 release transition |
| 隔离 | tenant A/B 相同 product/locale 不串 Site、Workspace、Config、Policy、manifest 或 Redis key |
| 权限 | `system:read` 只读；`system:write` 写资源；`system:publish` 变更 release；权限不落库 |
| Service auth | 配置 `KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 后，manifest、RPC manifest 和 `/system/*` 要求 `x-kokoro-service: web-bff` 与匹配的 internal secret 或 Bearer；错误/缺失 service auth 不触发业务读取；healthz/readyz 仍公开 |
| Tenant auth | 配置 service auth 的控制面请求仍要求 IAM tenant binding；缺 tenant 不从 query/body 回退，未配置 service token 时保留既有 fixture 模式 |
| 幂等 | 相同 tenant/key/hash 返回同一结果；相同 key 不同 hash 返回 409 |
| 故障 | Redis/PostgreSQL/IAM 错误 503；恢复后 readiness 200 且能重新读取事实源 |
| 入口 | HTTP manifest/control、RPC manifest fixture、healthz/readyz |

本地门禁：

```bash
pnpm contract:check
pnpm check
pnpm test:unit
pnpm test:integration
```

`pnpm test:integration` 会执行 `pnpm test:runtime-smoke`；有本地 IAM checkout 和相同隔离依赖时执行
`pnpm test:runtime-real-iam`。两个 smoke 都只创建临时数据库和 namespace，不读取或打印凭据。

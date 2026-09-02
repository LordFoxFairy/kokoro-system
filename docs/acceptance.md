# kokoro-system 验收清单

| 类别 | 验收 |
|---|---|
| 正向 | Site、Workspace、Policy、Config、Release 创建和 manifest 读取 |
| 负向 | 缺 tenant/host/product/body/idempotency、非法 cursor、未知资源、非法 release transition |
| 隔离 | tenant A/B 相同 product/locale 不串 Site、Workspace、Config、Policy、manifest 或 Redis key |
| Host 边界 | System 自己校验 `tenant_id + host`；错误绑定在业务数据读取前失败 |
| 权限 | `system:read` 只读；`system:write` 写资源；`system:publish` 变更 release；权限不落库 |
| Service auth | 业务路由要求 BFF service identity；健康探针公开；缺配置/错误凭据返回稳定错误码 |
| 幂等 | 相同 tenant/key/hash 返回同一结果；相同 key 不同 hash 返回 409 |
| 故障 | Redis/PostgreSQL 错误 503；恢复后 readiness 200 且重新读取事实源 |

本地门禁：

```bash
pnpm contract:check
pnpm check
pnpm test:unit
pnpm test:integration
```

`pnpm test:integration` 执行本仓 System-owned Site/Host fixture smoke，不启动 IAM fake，不依赖 IAM 数据库。

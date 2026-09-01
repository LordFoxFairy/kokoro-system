# BFF 接入说明

Web 和 Admin 只通过各自 server-side BFF 访问 System，浏览器不直连 System，也不接触
`DATABASE_URL`、`REDIS_URL`、IAM backend token 或 workload token。

## 请求上下文

BFF 从 IAM admission 结果构造 `TenantRequestContext`，再调用 System：

```http
Host: TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID
x-kokoro-iam-permissions: system:read,system:write
x-kokoro-request-id: REQUEST_ID
```

这些是内部 server-to-server headers；浏览器提交的同名 header 不得直接透传。System 仍使用 IAM 的
`GET /internal/iam/tenant-binding?host=TENANT_HOST` 做 Host/tenant 校验。BFF 应透传响应的
`x-kokoro-request-id` 到日志关联字段，但不要向浏览器暴露 workload token 或租户选择器。

## 调用约定

Manifest 读请求可使用 [`sdk/typescript`](../sdk/typescript/README.md) 的 server-only client。Site、Workspace、
Config、Policy 和 Release mutation 必须在 BFF 生成每次命令的 `Idempotency-Key`，并把 System 的稳定错误
映射为 BFF 自己的 HTTP 错误；不要在 BFF 重建 manifest 或直读 System 数据库。

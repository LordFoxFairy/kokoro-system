# BFF 接入说明

Web/Admin 只通过 BFF 访问 System。BFF 不把浏览器 header 当作身份事实，不直读 System 数据库，也不向浏览器暴露
服务凭据。

BFF 先在自己的入口完成会话/IAM admission，再把可信 `tenant_id`、actor、organization、permissions 和原始 Host
上下文传给 System：

```http
Forwarded: host=TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID
x-kokoro-iam-permissions: system:read,system:write
x-kokoro-request-id: REQUEST_ID
x-kokoro-service: web-bff
x-kokoro-internal-secret: BFF_SERVICE_TOKEN
```

System 在自己的 `system_site` 记录中校验 Host 是否属于该 `tenant_id`。IAM 不保存 Site/Host binding，BFF 不调用
任何 IAM Host 接口。`site_id` 仅供 System control-plane 使用。

`KOKORO_SYSTEM_BFF_SERVICE_TOKEN` 非空时，service identity 与凭据必须匹配；健康探针不需要凭据，业务请求缺失
或错误认证分别返回 `503 service_auth_not_configured` 或 `403 service_auth_failed`。业务 mutation 由 BFF 生成
`Idempotency-Key`，并透传 System 的 `request_id` 供链路关联。

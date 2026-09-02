# kokoro-system 运行说明

## 配置

必填：`DATABASE_URL`、`REDIS_URL`、`KOKORO_IAM_BASE_URL`、`KOKORO_IAM_BACKEND_TOKEN`。可选：
`KOKORO_SYSTEM_HOST`（默认 `127.0.0.1`）、`KOKORO_SYSTEM_PORT`（默认 `4240`）、
`KOKORO_SYSTEM_REDIS_NAMESPACE`（默认 `kokoro:system`）、`KOKORO_SYSTEM_BFF_SERVICE_TOKEN`。后者非空时
启用 web-bff service-auth：runtime manifest、RPC manifest 和 `/system/*` 业务路径要求精确的
`x-kokoro-service: web-bff`，以及匹配的 `x-kokoro-internal-secret` 或 `Authorization: Bearer`；控制面仍
必须通过 IAM tenant binding。未配置时保留既有本地 fixture 兼容模式。配置文件只允许引用环境变量；不要把
凭据写入仓库、fixture 或日志。

## 启动和探针

```bash
pnpm db:apply
pnpm build
pnpm start
curl -fsS http://127.0.0.1:4240/healthz
curl -fsS http://127.0.0.1:4240/readyz
```

启用 service-auth 后，健康探针无需凭据；业务请求示例：

```bash
curl -fsS 'http://127.0.0.1:4240/system/runtime-manifest?product_id=PRODUCT_ID&locale=en-US' \
  -H 'x-kokoro-service: web-bff' \
  -H 'x-kokoro-internal-secret: TOKEN' \
  -H 'x-kokoro-tenant-id: TENANT_ID'
```

也可将上一条凭据替换为 `-H 'Authorization: Bearer TOKEN'`。`TOKEN` 仅表示部署环境变量的值，不能写入
仓库或日志。

启动会先确认 Redis；readiness 同时 ping PostgreSQL 与 Redis。任一依赖失败返回 503，manifest 不从进程内
缓存或旧快照恢复。依赖恢复后再次检查 `/readyz`，新请求即可重新读取 PostgreSQL 并填充 Redis。

## 故障与恢复

1. Redis 故障：保留 PostgreSQL 配置事实，停止接收 manifest 成功响应；恢复 Redis 后验证 `PONG`、readiness
   和 tenant A/B 的不同 cache key。
2. PostgreSQL 故障：manifest 与 control plane 均返回 503；不写本地补偿缓存。恢复连接池后先跑 readiness，
   再读已发布 release。
3. IAM binding 故障或 tenant mismatch：返回 503，禁止在 System 查询 PostgreSQL/Redis 业务数据。
4. 发布误操作：只允许 `published → retired` 前滚；修复配置需创建新 release 并重新 validate/publish，
   不直接改已发布记录。

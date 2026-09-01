# kokoro-system 运行说明

## 配置

必填：`DATABASE_URL`、`REDIS_URL`、`KOKORO_IAM_BASE_URL`、`KOKORO_IAM_BACKEND_TOKEN`。可选：
`KOKORO_SYSTEM_HOST`（默认 `127.0.0.1`）、`KOKORO_SYSTEM_PORT`（默认 `4240`）、
`KOKORO_SYSTEM_REDIS_NAMESPACE`（默认 `kokoro:system`）。配置文件只允许引用环境变量；不要把凭据
写入仓库、fixture 或日志。

## 启动和探针

```bash
pnpm db:apply
pnpm build
pnpm start
curl -fsS http://127.0.0.1:4240/healthz
curl -fsS http://127.0.0.1:4240/readyz
```

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

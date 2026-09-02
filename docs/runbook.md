# kokoro-system 运行说明

## 配置

必填：`DATABASE_URL`、`REDIS_URL`。可选：`KOKORO_SYSTEM_HOST`、`KOKORO_SYSTEM_PORT`、
`KOKORO_SYSTEM_REDIS_NAMESPACE`、`KOKORO_SYSTEM_BFF_SERVICE_TOKEN`。凭据只来自环境变量，不写入仓库、fixture 或日志。

## 启动和探针

```bash
pnpm db:apply-schema
pnpm verify
pnpm start
curl -fsS http://127.0.0.1:4240/healthz
curl -fsS http://127.0.0.1:4240/readyz
```

业务请求需要受信 `tenant_id` 和 `Forwarded: host=TENANT_HOST`；System 用本仓 Site/Host 记录校验两者一致，
然后读取本仓配置。任一 PostgreSQL/Redis 依赖失败返回 503，manifest 不从进程内缓存或旧快照恢复。

## 故障与恢复

1. Redis 故障：保留 PostgreSQL 事实，manifest 请求 fail closed；恢复后先确认 readiness，再验证 tenant A/B 缓存隔离。
2. PostgreSQL 故障：manifest 与 control plane 返回 503；恢复连接池后重新读取已发布 release。
3. Site/Host 不匹配：拒绝请求，不读取租户业务配置；修复 System SiteDomain/Host 记录或可信上下文。
4. 发布误操作：只允许 `published → retired` 前进；修复配置创建新 release 并重新 validate/publish。

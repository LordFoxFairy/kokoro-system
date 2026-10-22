# kokoro-system

Kokoro 内部控制面：Site/域名/Policy、Workspace、Product/App/Feature、配置发布与 Runtime Manifest、模型目录与可执行路由。只返回路由，不执行推理、不拥有价格、IAM 或 BFF 公共 API。

当前实现：Node **24.13.0**、pnpm **12.3.4**、Nest **12.0.1** Express、Zod→OpenAPI、PostgreSQL SQL-first、Redis。86 业务操作与 2 probes；唯一入口 `src/main.ts`。阶段证据及未验项见 [CURRENT](docs/CURRENT.md)、[ACCEPTANCE](docs/ACCEPTANCE.md)。

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

## 模型密钥配置（System6，消费者仍需配对）

模型连接创建输入为只写 `api_key`，服务端生成引用；不再让操作者手填 `secret_handle_ref`。统一提供方可供多个模型与业务引用。后台／普通目录不返回 Key，Agent 专用领取只在当前 tenant／业务路由和精确 provider／revision／digest 一致时成功；发布或保存不发送模型探测／推理请求。

System部署私有 `KOKORO_SYSTEM_MODEL_KEY_MATERIAL_FILE` 是加密材料，不包含供应商 API Key。文件要求绝对路径、当前进程UID、单硬链接、非符号链接及0400/0600；最大4096字节，UTF-8 JSON只含 `encryption_key`、`idempotency_hmac_key`，均为不同的32字节规范Base64。进程只固定加载一次，不热换；配置缺失／损坏只阻敏感操作，非秘密目录仍可读。错误KEK在旧密文解密时拒绝，错误HMAC在原命令比较时拒绝，不自动重建、改写历史或回退Agent旧文件；不提供在线轮换。部署更换材料须另做停写、备份及受控重加密，勿直接替换现有材料。

专用 `model-management` 身份仅开放本模型目录／业务引用管理闭集和业务定义读取；它既无其他System域权限，也无明文领取权限。正式BFF仍须验证当前平台管理员，独立配置该机器凭据后再使用；已有 `web-bff` 身份不因此升级为global管理员。

创建结果未知后按原命令和主体查脱敏结果，404仅表示尚未确认，不证明已取消。Key不进浏览器持久恢复记录。原七日回执保原响应重放，永久创建标记阻止其过期后重新创建第二连接；过期后只能查原关联提供方当前状态。更换Key需新连接／修订。软删立即阻止新的领取；30日恢复窗口不被retention hold延长，维护同事务清密文及handle、保留非秘密查回标记。正常服务与后继Agent／BFF／后台尚未切此版本时，不把本仓隔离验收称作完整产品已上线。

## 提供方模型发现（System6.1）

后台显式刷新会由上述管理GET读取已保存连接的候选模型ID，不自动导入／发布／改默认项或价格。Key留在System，普通目录和Agent领取边界不变；部署的非公网DNS主机需在`KOKORO_SYSTEM_MODEL_DISCOVERY_PRIVATE_HOSTS`精确许可，默认空且无wildcard，loopback仍由原开关控制。候选验收与正常接线状态见[CURRENT](docs/CURRENT.md)。

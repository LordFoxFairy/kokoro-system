# kokoro-system Agent 规范

@../AGENTS.md

唯一任务表 `docs/IMPLEMENTATION_PLAN.md`；当前方案为 Root ADR-031 与本仓 TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL。

- 五模块 sites/workspaces/products/runtime-manifests/model-catalog；Node24/Nest12/Express、Zod→只读OpenAPI、pg SQL-first `database/schema.sql`、Redis6。
- 本轮 system_owner 唯一 writer，Root 串行暂存/提交；其他仓及共享基础设施不在写入范围。
- Controller 只做 wire，Service 业务编排，Repository SQL；同客户端跨模块只读完整性查询仅返回 bool/ID，不跨模块写表或 deep-import Repository/Row。
- `src/maintenance` 只定时调用各 owner 公开维护 Service，不是业务协调器；SQL 清理位于表 owner。
- 旧全局四层、Site RPC、SDK、generated/proto 已退出，不恢复 alias/fallback/双轨。
- 完整验证：`pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm contract:check`；配置独立资源管理员 URL 后 `pnpm test && pnpm test:schema:fresh`。
- Integration 无配置立即失败；每次随机独立数据库/Redis namespace。禁止 FLUSHDB、固定库 reset 或重启共享 PostgreSQL/Redis。
- G5 工作树证据不等于已提交验收；镜像与 Root 跨仓 live 状态见 CURRENT/ACCEPTANCE。

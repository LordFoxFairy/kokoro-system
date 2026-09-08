# kokoro-system Agent 规范

@../AGENTS.md

唯一任务表docs/IMPLEMENTATION_PLAN.md；完整System范围按Root ADR-031、TECHNICAL_DESIGN/API_CONTRACT/DATA_MODEL执行。
G1仅设计+runtime schema+生成器+canonicalSQL，业务Service/Controller/Repository/进程组合根等待Root审查放行。

- 五个业务模块sites/workspaces/products/runtime-manifests/model-catalog；System唯一数据库owner，各模块唯一writer。
- Nest12/Node24/Express、Zod运行时schema单向生成OpenAPI、pg SQL-first database/schema.sql、node-redis。
- 语言/SQL规则只引用Root手册；schema/type与业务class分开，不建立模板空层、通用configs/coordinator。
- 同事务具名只读完整性SQL可查其他System模块父/反向引用，只返回ID/bool；禁止跨模块写表与Repository/Row deep-import。
- G1旧全局四层/Connect仍是当前业务代码，不是目标模板；新增schema尚未接Controller，不能宣称目标端点上线。
- 本轮system_owner唯一writer，Root串行Git暂存提交；不操作其他仓、不清共享数据库/Redis。
- G1验证：pnpm contract:generate:openapi、pnpm test:contract:target、pnpm typecheck、TEST_ADMIN_DATABASE_URL=... pnpm test:schema:fresh。
- 完整放行仍需format/lint/typecheck/unit/integration/contract/architecture/build/fresh-schema/smoke以及Root跨仓consumer/topology验收。

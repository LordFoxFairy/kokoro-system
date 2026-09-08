# kokoro-system 子仓 Agent 规范

@../AGENTS.md

本仓是 System owner。当前行为与目标设计分别见 docs/CURRENT.md 和 docs/TECHNICAL_DESIGN.md；
唯一有效推进任务表是 docs/IMPLEMENTATION_PLAN.md。G0 只授权设计准备，不授权业务重写。

- Owner：Site/域名/站点策略、产品配置、Runtime Manifest、System Workspace；Model 按 Root ADR-029 合入，尚未执行 cutover。
- 语言、目录、SQL、测试规则只引用 Root 三份专项手册，不复制或覆盖；旧全局四层仅是当前实现，不是目标模板。
- 目标采用 Nest 原生业务模块/DI；独立 releases、执行 runtimes 和 generated/proto 均非预建要求。
- 当前源码入口为 src/main.ts；当前机器事实源为 contract/openapi/system.openapi.json、contract/proto 与 database/schema.sql。
- 协议去留、数据库技术栈与生成 client 位置须先过本仓设计门；当前生成物禁止手改，也不提前删除。
- 本仓业务实现只写自己的事实；IAM 身份/权限、BFF Project、Agent 执行、Billing 账务不迁入 System。
- 后续实现遵守任务卡单 writer、主控提交/集成与独立审查；保护其他仓及 Root 已有未提交变更。

当前实现完整验收命令如下；G0 文档准备的较小验证范围及未运行原因见任务表：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:apply-schema
```

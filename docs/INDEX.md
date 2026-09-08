# kokoro-system 文档索引

状态：2026-09-07，G0 设计准备。当前源码仍为旧实现，目标门尚未通过。

## 状态语义

本仓文档统一使用以下标签，避免把设计目标写成现状：

- **已实现**：可在当前源码、Schema、contract、test 或 workflow 中定位；仍需用当前 checkout 的命令结果验证。
- **目标**：进入生产门禁前应达到的状态，当前不据此宣称完成。
- **缺口**：当前源码或可复现证据尚未闭环；由明确 owner 后续处理。
- **外部前置**：由部署平台、BFF、IAM 或运维系统提供，本仓只记录依赖，不宣称已配置。

## 推荐阅读顺序

1. [`CURRENT.md`](CURRENT.md)：当前边界、已实现能力、阶段完成条件和未闭环项。
2. [`TECHNICAL_DESIGN.md`](TECHNICAL_DESIGN.md)：G0 能力/选型/目录候选；后续章节记录当前执行流与失败语义。
3. [`API_CONTRACT.md`](API_CONTRACT.md)：HTTP/Connect、header、权限、幂等、分页和错误策略。
4. [`DATA_MODEL.md`](DATA_MODEL.md)：表 owner、自然键、无外键关系、状态机、索引和 retention。
5. [`SECURITY.md`](SECURITY.md)：trust boundary、service auth、tenant isolation、secret 与供应链控制。
6. [`RELIABILITY.md`](RELIABILITY.md)：timeout、retry、idempotency、readiness、恢复与降级取舍。
7. [`ACCEPTANCE.md`](ACCEPTANCE.md)：可执行验收矩阵和未证明的生产门禁。
8. [`SLO.md`](SLO.md)：目标 SLI/SLO、错误预算和告警；不包含虚构实测值。
9. [`RUNBOOK.md`](RUNBOOK.md)：本地启动、诊断、恢复、回滚和 evidence 采集。
10. [`ADR/INDEX.md`](ADR/INDEX.md)：仍有效的架构决策。
11. [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)：唯一有效推进任务表、阶段门与本轮证据。

## 当前实现的规范性事实源

| 事实 | 唯一来源 | 说明 |
|---|---|---|
| HTTP 字段、路径、响应 | `../contract/openapi/system.openapi.json` | OpenAPI 3.1；operation metadata 也在此处 |
| Connect RPC message/service | `../contract/proto/` | 由 Buf/protoc 生成 TypeScript descriptor |
| Contract provenance/classification | `../contract/provenance.json` | Proto/OpenAPI/generated digest、V1 fresh-cutover 与 consumer inventory；发布 provenance 限制见 `../contract/README.md` |
| 数据库表与约束 | `../database/schema.sql` | V1 canonical schema；文档不复制为可执行 SQL |
| 当前运行行为 | `../src/` + `../test/` | 文档与实现冲突时先登记缺口，再由 owner 收敛 |
| 跨仓 owner/依赖规则 | Root `AGENTS.md` 与 `docs/ARCHITECTURE_STANDARD.md` | Root 不拥有本仓 wire source |

## ADR

- [`0001-system-owner-and-trust-boundary.md`](ADR/0001-system-owner-and-trust-boundary.md)
- [`0002-local-contract-authority.md`](ADR/0002-local-contract-authority.md)

## 过程材料

- [`superpowers/plans/2026-09-03-production-closure-docs.md`](superpowers/plans/2026-09-03-production-closure-docs.md)：
  已完成的历史文档阶段计划；不再授权新四层/Proto 实施，后续使用 IMPLEMENTATION_PLAN。

旧的大小写混合入口和重复 BFF contract 文档已合并到上述 canonical 文件；V1 clean-slate 不保留 alias 或重复事实源。

# System 文档索引

当前：G1–G4 已提交验收，G5 完整运行闭环工作树；提交、命令与未验项只以 CURRENT/ACCEPTANCE 为准。

1. [CURRENT](CURRENT.md)：当前源码、证据与环境阻断。
2. [TECHNICAL_DESIGN](TECHNICAL_DESIGN.md)：owner、模块、事务、依赖与生命周期。
3. [API_CONTRACT](API_CONTRACT.md)：HTTP 单协议、scope/权限/错误规则，字段链接机器事实源。
4. [DATA_MODEL](DATA_MODEL.md)：22 表、不可变/删除/锁、维护与索引。
5. [SECURITY](SECURITY.md)、[RELIABILITY](RELIABILITY.md)、[SLO](SLO.md)、[RUNBOOK](RUNBOOK.md)：安全、可靠性、目标与操作。
6. [ACCEPTANCE](ACCEPTANCE.md)：实际检查及未验项。
7. [IMPLEMENTATION_PLAN](IMPLEMENTATION_PLAN.md)：唯一任务卡/历史证据/Root 消费者与拓扑接线。
8. [ADR](ADR/)：本仓裁决；总裁决引用 Root ADR-031，历史设计不覆盖当前方案。

“已实现”指源码行为；“已验收”需 Root 在对应 commit 复跑；“目标”与“外部前置”不算实际证明。

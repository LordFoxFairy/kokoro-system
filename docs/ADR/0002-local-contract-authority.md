# ADR-0002：运行时 schema authority 与 immutable integrity

状态：Accepted，2026-09-07；承接Root ADR-031，替代2026-09-03手写OpenAPI/双协议目标。G5已完成唯一Nest HTTP源码cutover，实际验收见CURRENT。

1. System HTTP唯一字段源是本仓src/modules业务schema；Zod运行时校验与toJSONSchema单向生成contract/openapi/system.openapi.json，不维护第二份DTO/class-validator/手写OpenAPI。scripts只编排path/metadata，src不依赖scripts；Nest route inventory对齐生成operation。
2. generated artifact固定2.0.0、v1-fresh-cutover；provenance记录每个Zod与生成器source digest和OpenAPI digest。首发发布任务再绑定source commit/artifact，不假造已发布registry。
3. 旧Site Proto/generated仅在G1保留以运行旧基线；G5承接HTTP行为后已删除source/handler/generated/工具，Model transport按Root ADR031不保留RPC。
4. 每个operation记录owner/visibility/stability/permission/idempotency/CAS/global-operator，request/response实际typed schema不得退化data:{}。
5. SQL-first canonical database/schema.sql唯一；允许两个具名技术完整性trigger：model_revision_immutable_guard、system_feature_identity_guard。它们只拒绝不可变身份/已发布快照的更新删除，不自动改字段、写其他表、编排事件或业务状态；真实PG负例验证。这承接旧Model不可变DB保障，应用仍负责publish/retire事务与授权。
6. 根规范API§2：成功{data}；错误{error:{code,message,retryable}}；x-request-id仅响应header。G1替换旧meta为fresh-cut breaking，不增加alias。

比较：手写OpenAPI+parser双源易漂移，弃用；class DTO重复Zod无收益，弃用；仅应用保护快照弱于旧Model已存在DB保障，采用具名技术trigger而不是泛化审计trigger。

验证：contract:generate:openapi、contract:lint、verify:contract-provenance、test:contract:target、test:schema:fresh；G1不等同业务HTTP或生产SLO完成。

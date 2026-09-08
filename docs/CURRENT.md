# System 当前状态

2026-09-08，G1已由Root提交f5702068d4416ad90b1bd02af57d2825c32be916并验收；G2实现切片待Root审查。
本轮唯一计划docs/IMPLEMENTATION_PLAN.md。完整范围五模块，不把Site切片当完整交付。

## 当前事实

生产入口src/main.ts仍为Node HTTP+旧全局四层+Site Connect；G2新增Nest AppModule测试组合根，真实挂载Sites 11、Workspaces 6操作与2 probes，使用新协议、pg事务receipt/CAS和Redis连接。尚未切换生产入口，不部署此过渡切片。
G1已新增目标Zod schema/生成OpenAPI与目标SQL；**本工作树machine contract/schema已先行，不与旧业务兼容运行**，不得对现有库应用或宣称可部署。
Model仍独立仓且Prisma；System内新增model_* SQL不等于cutover。BFF原调用路径缺/v1，Agent原未接Model解析。

基线证据由baseline agent：22files/111pass、3files/8integration skip；此不是当前G1完整测试结果，也不是实际PG/Redis集成验收。
G1新增检查和结果只在同一IMPLEMENTATION_PLAN记录；未实现HTTP测试不算通过。

## 已冻结目标

Root ADR031：Node24/Nest12/Express、Zod→只读OpenAPI、SQL-first pg、node-redis；sites/workspaces/products/runtime-manifests/model-catalog。
Config保存生效及受控发布、tenant+Site完整Manifest隔离/Policy/fence、Product/App/Feature/exposure/presentation、完整Model catalog/provider/immutable revision/labels/routing/health。
API新规范{data}/{error:{code,message,retryable}}+x-request-id；旧meta及RPC将删除，无兼容双轨。
具体唯一当前设计见TECHNICAL_DESIGN、API_CONTRACT、DATA_MODEL；G0文档准备及旧commit证据保留在IMPLEMENTATION_PLAN。

## 未完成

G3 Products/Runtime Manifest、G4 Model Catalog的Nest业务和完整状态机/发布/双fence测试；G2已验证Sites/Workspaces CRUD、CAS、tenant、receipt和双连接父删除竞态，尚非全System完成；retention与reconciliation worker；完整lint/build/CI/smoke；BFF/Agent消费者和旧Model身份/配置/部署退出。
IAM内部AuthZ尚未交付不伪造接通；BFF未提供permissions时非public Manifest必须403。生产credential轮换/metrics/traces/SLO/容量/灾备仍需独立真实证据。

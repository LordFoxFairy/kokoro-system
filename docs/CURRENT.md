# System 当前状态

2026-09-07，G1完整设计/机器门进行中；基线7dde8e7683ad4c9a3a35bc3681bf44b523eea574。
本轮唯一计划docs/IMPLEMENTATION_PLAN.md。完整范围五模块，不把Site切片当完整交付。

## 当前事实

业务源码仍Node HTTP+旧全局四层+pg/Redis+Site Connect；当前运行行为、旧接口meta envelope、旧receipt tenant列均尚未替换。
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

全部Nest业务替换、对应真实CRUD/状态机/CAS/tenant/幂等/父删除竞态/缓存测试；retention与reconciliation worker；完整lint/build/CI/smoke；BFF/Agent消费者和旧Model身份/配置/部署退出。
IAM内部AuthZ尚未交付不伪造接通；BFF未提供permissions时非public Manifest必须403。生产credential轮换/metrics/traces/SLO/容量/灾备仍需独立真实证据。

# System 数据模型

状态：G1 目标 fresh SQL，业务 writer 尚未实现。唯一 canonical schema：database/schema.sql；SQL-first + pg，禁止 Prisma/第二schema/历史 migrations。
基线7dde8e7；保留已有真实 Site/Workspace/Policy/Config/Release/Binding/Receipt/fence 表，增补产品与Model业务结构，不迁移开发数据。

## 表、索引、约束与生命周期

| 表 | owner / writer | 主查询与索引 | 约束理由 / 生命周期 |
|---|---|---|---|
| system_site | sites | tenant+status+id；tenant+created_at DESC+id DESC | 活跃tenant/site_key唯一；version>0；软删30天，仍有活引用拒绝清理 |
| system_site_host | sites | tenant/site+hostname；global hostname | active域名全局唯一防跨tenant接管；关联无恢复，删除archived，30天物理清理 |
| system_site_policy | sites | tenant/site active | 一站一active；version CAS；allowed locale/product版本化数组用于装配不作查询条件，64KiB；默认语言必须允许；随Site清理 |
| system_workspace | workspaces | tenant/site/status/id及tenant/created_at/id | tenant/site/key活跃唯一；site不可变；软删30天 |
| system_product | products/global | product_key；created_at/id | 产品键永久不复用；version CAS；软删30天可恢复，期满保留ID/key tombstone，不物理删除身份 |
| system_application | products/tenant | tenant/site/created_at/id；product反向检查 | tenant/site/app_key活跃唯一；product/site不可变；软删30天，先删除关联 |
| system_feature_definition | products/global | global_feature_key；product/created_at/id | global key永久唯一、不可变结果契约；retired_at生命周期，无软删；永久保留身份，32KiB schema_version1结果契约 |
| system_app_feature_exposure | products/tenant | tenant/application/feature | 每App/Feature唯一；无恢复语义关系，删除物理，generation同事务；enabled独立boolean |
| system_presentation | products/tenant | tenant/application/locale/surface | 身份唯一；version CAS；navigation/theme/i18n typed schema_version1 JSON≤64KiB；App清理时物理清理 |
| system_config_record | products | tenant/locale/module/scope/product；release引用检查 | active完整identity唯一（tenant/site/module/key/scope/product/locale/release）；schema_version>0；普通配置软删30天；release快照随retention |
| system_config_release | products | tenant/status/id；tenant/created_at/id | tenant非空、tenant/release_key未retired唯一；digest64hex/version>0；draft→validated→published→retired；retired无binding后保留90天 |
| system_release_binding | products | tenant/site/product/scope；release反向影响 | active完整scope唯一；tenant必需，site可空表示tenant默认；归属同tenant published release；archived30天物理清理 |
| system_runtime_manifest_generation | runtime-manifests | tenant PK | 正BIGINT；每tenant写同事务增加，tenant注销时随owner清理 |
| system_catalog_generation | products | singleton scope PK | global配置写fence；常驻一行，不是业务config KV |
| system_command_receipt | 各写用例内部 | scope_kind/scope_id/key；expires_at | scope_kind/scope_id/key唯一+hash+completion一致性；operation/actor进入digest；完成7天后分批物理清理；pending只在事务内不持久泄漏 |
| model_definition | model-catalog | model_key；created_at/id | 全局key永久唯一；version>0；软删30天可恢复，期满保留ID/key tombstone |
| model_provider | model-catalog | provider/provider_key；created_at/id | provider/key永久唯一；只存secret_handle_ref不存secret；软删30天可恢复，期满保留ID/key tombstone |
| model_label | model-catalog | label_key；feature_key/created_at/id | label_key永久唯一；feature_key引用产品Feature，default_revision同feature；软删30天可恢复，期满保留ID/key tombstone |
| model_revision | model-catalog | model/revision；feature/published/retired/priority/id；provider反向 | model+revision唯一；draft可编辑，published/retired内容immutable，无通用delete；永久保留revision引用 |
| model_routing_policy | model-catalog/tenant | tenant/label | tenant/label唯一，tenant/feature WHERE is_default唯一；指定revision须published且feature匹配；删除物理；version CAS |
| model_provider_health_state | model-catalog | provider PK | 唯一health权威投影，不在provider复制health字段；generation CAS；observed_at UTC，provider删除后清理 |
| model_cache_generation | model-catalog | resolve singleton | global模型写推进，tenant routing另推进tenant fence；常驻 |

SQL-only system_product_profile 从无production writer，删除；system_audit_event 无writer且Audit归IAM，删除。不存在新Profile/Audit兼容表。
Model旧Prisma schema只在独立旧仓，G1不复制其访问层/enum/receipt；合入模型统一System receipt，避免旧operation+key缺tenant的冲突范围。
旧Model TEXT资源ID fresh-cut统一UUID（外部model_key/provider_key仍TEXT）；这是明确breaking，与旧数据不做迁移兼容。

## 关系完整性与锁

无外键：每条引用写与父删除共享TECHNICAL_DESIGN锁序；先tenant身份再父行FOR UPDATE，锁内校验deleted/status/tenant，后写关系。
Site→Host/Workspace/App/Policy；Product→App/Feature/Config/Binding；App→Exposure/Presentation；Feature→Exposure/Label/Revision；Release→Config/Binding；Model/Provider→Revision；Label→Routing；Revision→Label默认/Routing。
跨tenant父ID统一NOT_FOUND，活依赖删除RESOURCE_IN_USE；Provider unhealthy仅影响resolve不影响基础CRUD。恢复重新校验自然键与所有父引用；冲突409不抢占其他资源。
全局Feature/Provider/Model删除或retire与tenant引用新增共锁同global父行，防跨tenant竞态。

Reconciliation（目标每小时批量1000行，当前尚未接线）由各module owner执行显式列LEFT JOIN/NOT EXISTS：

```sql
SELECT w.id, w.tenant_id, w.site_id FROM system_workspace w
WHERE w.deleted_at IS NULL AND NOT EXISTS
 (SELECT 1 FROM system_site s WHERE s.id=w.site_id AND s.tenant_id=w.tenant_id AND s.deleted_at IS NULL);
SELECT e.id, e.tenant_id, e.application_id FROM system_app_feature_exposure e
WHERE NOT EXISTS (SELECT 1 FROM system_application a WHERE a.id=e.application_id AND a.tenant_id=e.tenant_id AND a.deleted_at IS NULL);
SELECT r.id, r.model_id, r.provider_id FROM model_revision r
WHERE NOT EXISTS (SELECT 1 FROM model_definition m WHERE m.id=r.model_id)
   OR NOT EXISTS (SELECT 1 FROM model_provider p WHERE p.id=r.provider_id);
```

其余关系采用同样tenant复合谓词，交付须逐关系测试；发现orphan写结构化错误/告警，投影fail-closed，不自动删除不可变快照。
GC以expires_at或deleted_at批量索引查询，SKIP LOCKED限制批次，父清理重新检查引用，7/30/90天目标需实际测试时钟与恢复证明。法律留存不归本仓自动决策，有hold请求时暂停对应purge。

## 验证门

G1：schema静态owner/no-FK检查、唯一约束负例、PG fresh安装/重装拒绝；目标隔离数据库 system_g1_<random>，禁止重置共享数据。
G2后：真实双连接父删除/关系创建竞态、CAS、receipt replay、跨tenant、global+tenant fence、immutable revision、retention，以及EXPLAIN(ANALYZE,BUFFERS)真实查询plan。
空库安装不能证明业务事务/权限已实现；所有尚未运行行为测试在任务表显式待验。

Receipt scope_kind固定global/tenant；global scope_id空串、tenant非空由SQL CHECK约束，不能用tenant magic string碰撞global。Config结构矩阵见API_CONTRACT与ck_system_config_scope_fields；关系scope指向的资源在同事务父锁内重验。

### 快照技术约束
model_revision_immutable_guard承接旧Model数据库安全不变量，拒绝所有DELETE、identity修改；published后只允许retired_at/version/updated_at，published_at/digest/内容不可改，retirement不可撤销。system_feature_identity_guard永久保护Feature key/结果契约与身份，仅可retire/version；两者不编排业务、不隐藏写入，例外依据ADR0002与Root批准的immutable快照要求。真实SQL负例验证其行为。
Binding不提供global release/API；tenant scope要求scope_id=tenant、site空，product scope要求scope_id=product UUID、site空，surface要求site+非空surface；均必需product，服务端同tenant校验published release。全局普通Config仍支持，无global release发布路径。

Global Config release_id强制NULL；system_config_release.tenant_id NOT NULL；Config读写conditional scope的认证、查询选择见API_CONTRACT，不能用COALESCE回退全局release。

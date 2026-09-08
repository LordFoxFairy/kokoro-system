# System 当前状态

2026-09-08。G1 `f5702068d4416ad90b1bd02af57d2825c32be916`、G2 `d057deb706a34129e23bec5ec1f70e235ca1d4ce`、G3 `f13bb73dfe81c3d79036852d3d3cb7a6cbb1916d`、G4 `51bc22dac4b32da86984e7147caaae5e4db6a34a` 已由Root提交验收。当前为 **G5完整源码交付**（与本文件同提交，提交前基线 `51bc22d`）；完整任务历史只维护 IMPLEMENTATION_PLAN。

## 当前源码事实

- 唯一正式入口main→startSystem→Nest AppModule；Node24/Nest12/Express、SQL-first pg、Redis6；五模块83业务operation+2probes均实际挂载。
- sites/workspaces/products/runtime-manifests/model-catalog完整业务已实现；跨module写表边界、tenant/scope、权限、CAS、receipt、父锁完整性、immutable快照、发布绑定和缓存fence由真实PG/Redis测试承接。
- Model resolve仅Agent、litellm，不推理、不回凭据/endpoint；明确tenant默认policy，无first-row fallback；health时效最后fence后重验。
- 正式生命周期包括三个服务token必填、部分启动失败释放、请求budget/断连PGRedis取消、HTTP deadline无late commit、未完成PG握手socket有界drain、脱敏JSON一次日志。
- Maintenance定时器已接线；7/30/90天、逐资源父锁/反查、永久identity tombstone、restore原子PG时钟30天截止、hold与orphan检测，默认每小时最多1000候选/查询与5s cycle预算。
- 旧全局四层、旧Node router、RPC/Proto/generated、SDK/相关依赖、DOM lib已删除。旧有效安全/一致性行为测试映射在任务表；没有保留alias/fallback充数。
- HTTP artifact仍2.0.0，SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37`，18输入source digest不变；provenance只退出旧Proto metadata。

## 验证与未闭环

G4 committed HEAD：51pass/0skip（7 focused files）；旧全量152pass/5legacyfail/8skip仅作历史，不作为当前结果。G5最新完整本仓13files/86pass/0skip；format/typecheck（含scripts）/lint/build/Redocly/drift/18source provenance/contract12pass；fresh schema23断言22表通过，详见ACCEPTANCE。Root 已在最终冻结树重跑完整 `pnpm verify`：13 files / 86 pass / 0 skip，fresh 23 断言 / 22 表；committed HEAD 跨仓证据由 Root `docs/CURRENT.md` 绑定具体 SHA。

Root冻结源码跨仓live已PASS：System/BFF正式pnpm dev、发布binding覆盖、catalog/default/manifest、跨tenant404/空catalog、BFF resolve403、Agent真实default/explicit+factory映射；最终 committed HEAD 重跑记录见 Root CURRENT。BFF consumer `1e03b87` + dev `26eec011`，Agent `e24b4aa`已提交测试；Root拥有旧Model active退出/九active拓扑，不由System复制其文件。

**环境阻断**：Docker Desktop后端存在但daemon API1.51/1.47 info均500、socket ping/version超时，Root独立复现；未重启/重置Docker或共享infra。镜像RC实跑及CI供应链扫描/SBOM/provenance未验；只配置门禁不宣称已通过。长期生产SLO/容量/灾备/secret轮换仍是部署环境证据，不以本轮System验收替代九仓生产验收。

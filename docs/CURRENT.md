# System 当前状态

2026-09-08。G1 `f5702068d4416ad90b1bd02af57d2825c32be916`、G2 `d057deb706a34129e23bec5ec1f70e235ca1d4ce`、G3 `f13bb73dfe81c3d79036852d3d3cb7a6cbb1916d`、G4 `51bc22dac4b32da86984e7147caaae5e4db6a34a` 已由Root提交验收。当前为 **完整 System 源码、消费者 HTTP 与 NestJS 工程边界均已提交验收**：G5业务代码 `d7257aa56632627fe0ba8ec4576c32c550a25c3d`，R6工程收敛 `dcfa8468446108c17cd65b32fc028af261472c99`；完整任务历史只维护 IMPLEMENTATION_PLAN。

## 当前源码事实

- 唯一正式入口main→startSystem→Nest AppModule；Node24/Nest12/Express、SQL-first pg、Redis6；五模块83业务operation+2probes均实际挂载。
- sites/workspaces/products/runtime-manifests/model-catalog完整业务已实现；跨module写表边界、tenant/scope、权限、CAS、receipt、父锁完整性、immutable快照、发布绑定和缓存fence由真实PG/Redis测试承接。
- Model resolve仅Agent、litellm，不推理、不回凭据/endpoint；明确tenant默认policy，无first-row fallback；health时效最后fence后重验。
- 正式生命周期包括三个服务token必填、部分启动失败释放、请求budget/断连PGRedis取消、HTTP deadline无late commit、未完成PG握手socket有界drain、脱敏JSON一次日志。
- Maintenance定时器已接线；7/30/90天、逐资源父锁/反查、永久identity tombstone、restore原子PG时钟30天截止、hold与orphan检测，默认每小时最多1000候选/查询与5s cycle预算。
- 旧全局四层、旧Node router、RPC/Proto/generated、SDK/相关依赖、DOM lib已删除。旧有效安全/一致性行为测试映射在任务表；没有保留alias/fallback充数。
- HTTP artifact仍2.0.0，SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37`，R6保留原18输入并加Products public入口为第19源，源码digest真实更新，artifact字节不变。

## 验证与未闭环

G4 committed HEAD：51pass/0skip（7 focused files）；旧全量152pass/5legacyfail/8skip仅作历史，不作为当前结果。G5最新完整本仓13files/86pass/0skip；format/typecheck（含scripts）/lint/build/Redocly/drift/18source provenance/contract12pass；fresh schema23断言22表通过，详见ACCEPTANCE。Root 已在最终冻结树重跑完整 `pnpm verify`：13 files / 86 pass / 0 skip，fresh 23 断言 / 22 表；Root 已在该 committed clean HEAD 再跑相同全门通过，并完成真实消费者HTTP联调；详细日志见 Root `docs/CURRENT.md`。

Root冻结源码跨仓live已PASS：System/BFF正式pnpm dev、发布binding覆盖、catalog/default/manifest、跨tenant404/空catalog、BFF resolve403、Agent真实default/explicit+factory映射；committed HEAD 重跑已PASS，记录见 Root CURRENT。BFF consumer `1e03b87` + dev `26eec011`，Agent `e24b4aa`已提交测试；Root拥有旧Model active退出/九active拓扑，不由System复制其文件。

**环境阻断**：Docker Desktop后端存在但daemon API1.51/1.47 info均500、socket ping/version超时，Root独立复现；未重启/重置Docker或共享infra。本机镜像RC仍未验；远端v0.1.0 Actions 34221025412已通过build/image smoke，Trivy发现6项已修复HIGH/CRITICAL并阻断发布；SBOM/provenance与v0.1.1完整发布待CI验证。长期生产SLO/容量/灾备/secret轮换仍是部署环境证据，不以本轮System验收替代九仓生产验收。


## R6 已提交工程收敛（`dcfa8468446108c17cd65b32fc028af261472c99`）

第一轮及移除诊断后的完整verify均15files96pass0skip+fresh23/22通过（`/tmp/r6-final-clean-verify.log`）。中间一次model afterAll10s超时未复现，三轮诊断及后续完整门通过，风险如实记录ACCEPTANCE。真正typed lint已启用并清除81条原始诊断；SystemError无HTTP status、18码映射与完整envelope保持；四public入口与最小Nest exports、Repository零HTTP依赖、唯一DI配置已实现。真实生命周期6pass，含单次配置解析与部分失败两资源关闭。新增架构实际typed规则正反、公开面/消费者/循环/禁止依赖门。

R6-guard最终提交后，Root 在 clean `dcfa8468446108c17cd65b32fc028af261472c99` 独立复跑 `pnpm verify`：16files/97pass/0skip、fresh23断言/22表，全部质量与契约门通过；跨仓 source HTTP smoke PASS 且 owned resources removed；Root结构门对System为0违规。Controller零database/cache直连（probe也无豁免），HealthService承接原ready聚合，手工Service/Repository含alias门已补。日志 `/tmp/r6-root-verify-committed.log`、`/tmp/r6-root-smoke-committed.log`。原一次非复现hook风险继续保留。


## R7 v0.1.1 发布修复（待Root提交/tag）

基线f487f635294c98cb8a44e638ed1ee0afa6d28feb。固定Debian12.13 runtime中libcap2需deb12u3、libgnutls30需deb12u7；按Root提供的v0.1.0扫描证据，在runtime依赖安装前执行apt-get update/upgrade并清apt lists，不降低Trivy exit-code、不加ignore/VEX。package版本0.1.1，无业务/SQL/OpenAPI/lock变更。Node24完整verify16files98pass0skip+fresh23断言22表，日志`/tmp/r7-verify.log`；远端镜像升级结果未在本机验证，由Root提交并推v0.1.1触发原单构建扫描推广流程。


## R8 v0.1.2 attestation能力门（待Root提交/tag）

Root确认v0.1.1 Actions34221703911的verify/fresh/build/image smoke/Trivy/SBOM/GHCR push全部通过，镜像已发布0.1.1/0.1/latest，digest `sha256:827bb91720fbd1bbe0fe2dab1efaae98b3905b7830c491535c5de5f0e2bf34b4`。随后provenance attestation因GitHub不支持user-owned private repositories而失败，SBOM attestation被跳过；因此镜像已发布但该workflow为红，不能写成镜像未发布或attestation成功。
R8仅为两个attestation step增加`github.event.repository.private == false`条件，private仓明确跳过，不降低测试/smoke/漏洞扫描/SBOM生成/push门。package0.1.2，Dockerfile/业务/SQL/OpenAPI/lock不变；v0.1.2完整CI闭环由Root提交/tag后验收。

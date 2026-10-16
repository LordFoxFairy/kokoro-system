# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **4.0.0**，HTTP `/v1`；本次 breaking 版本发布 immutable direct/optional LiteLLM connection snapshots。83 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI 合法性；独立操作 inventory/schema 负例、drift、provenance 检查 20 个 HTTP 输入和 artifact digest。模块根内部 cache schema 不属 HTTP 输入。无 Proto/RPC/SDK/generated 双轨。

当前4.0.0 artifact SHA256 `c7cda9d09db266cd26dc1b80dfe9bb95c3c9f6a91bdbd6c5d7de4f85295d1dc6`；provenance SHA256 `37e338939ebecc4a61cf7aff4d14c2e28b5bc34381e66324a2009988e793d2d0`。source commit由Root正式发布任务绑定，不在生成物中预填未知commit。Agent/BFF仍须按各自owner任务更新version/commit/artifact SHA与provenance digest pin；live验证与Root cutover见唯一任务表。不在 Root Developer API 门户发布此内部 API。

## Generation 与 breaking 策略

Generation 单向由上述运行时 Zod 输入生成，只读 artifact 禁止手改；provenance 与独立 drift/route inventory 同时验证。历史 G5 切片未改变当时冻结的 HTTP 字段与 artifact digest；当前4.0 metadata 修正已正规重生 artifact 与 provenance，不改变 wire 业务语义。
Breaking：4.0.0 从旧 transport/gateway_model_name 生产字段切换为provider的稳定协议/拓扑/base URL/secret引用与revision/resolve的owner连接快照和唯一request_model。provider技术字段创建后不可编辑，metadata CAS仍可更新；request不接受owner快照。默认direct仅作用provider创建输入，输出必有显式类型；生成器对request使用Zod input、response使用output。required context/output两界与83 operations/2 probes保留，HTTP仍/v1；不保留旧连接字段alias/fallback。消费者必须固定本次owner commit/version/artifact/provenance后一起切换，当前未宣称Agent/BFF/Admin已接新字段、正常库迁移或真实模型/资金许可。

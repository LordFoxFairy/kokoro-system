# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **3.0.0**，HTTP `/v1`；本次 breaking 版本发布 model revision execution capability bounds。83 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI 合法性；独立操作 inventory/schema 负例、drift、provenance 检查 18 个 HTTP 输入和 artifact digest。模块根内部 cache schema 不属 HTTP 输入。无 Proto/RPC/SDK/generated 双轨。

当前3.0.0 artifact SHA256 `74c338f25494621421f2b9eb9edd78df57d4ee4560ca969a4bef30514fe59472`；source commit由Root正式发布任务绑定，不在生成物中预填未知commit。Agent/BFF仍须按各自owner任务更新version/commit/artifact SHA与provenance digest pin；live验证与Root cutover见唯一任务表。不在 Root Developer API 门户发布此内部 API。

## Generation 与 breaking 策略

Generation 单向由上述运行时 Zod 输入生成，只读 artifact 禁止手改；provenance 与独立 drift/route inventory 同时验证。G5 未改变冻结 HTTP 字段与 artifact digest。
Breaking：3.0.0 在既有 `/v1/system/model-catalog/resolve` strict response 中新增 required `context_window` 与 `max_output_tokens`，不新增 operation/URI，也不保留 2.0 response alias、optional fallback 或双轨。消费者必须固定本次 owner commit、version、artifact SHA-256 与 provenance/source digest 后一次升级；未来 breaking 变化仍须先 owner 裁决、版本化契约及消费者接线再发布，不能静默改 artifact。

# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **2.0.0**，HTTP `/v1` fresh-cutover。83 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI 合法性；独立操作 inventory/schema 负例、drift、provenance 检查 18 个 HTTP 输入和 artifact digest。模块根内部 cache schema 不属 HTTP 输入。无 Proto/RPC/SDK/generated 双轨。

冻结 artifact SHA256 `f9ea76f107e1ea0fc19df20ee7c59032c0fbac66e640e9a16a1b770ab27c1f37`，首发布来源 G1 `f5702068d4416ad90b1bd02af57d2825c32be916`。消费者 BFF/Agent 已固定该 artifact；live 验证与 Root cutover 见唯一任务表。不在 Root Developer API 门户发布此内部 API。

## Generation 与 breaking 策略

Generation 单向由上述运行时 Zod 输入生成，只读 artifact 禁止手改；provenance 与独立 drift/route inventory 同时验证。G5 未改变冻结 HTTP 字段与 artifact digest。
Breaking：2.0.0 是未发布基线上的 `/v1` fresh-cutover，明确删除旧 Site RPC、旧 meta/request-id alias、任意配置 JSON 与缺失 CAS 行为，不保留双轨。首次消费者固定 G1 commit/version/digest；未来已发布字段、错误或状态语义的 breaking 变化必须先 owner 裁决、版本化契约及消费者接线再发布，不能静默改 artifact。

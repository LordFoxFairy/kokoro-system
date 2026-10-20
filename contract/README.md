# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **6.0.0**，HTTP `/v1`；共享不可变模型修订，由各业务独立组合、选择和命名。85 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI；独立操作 inventory/schema 负例、drift、provenance 检查 22 个正式输入／权限闭集来源与 artifact digest。模块内部 cache schema 不属 HTTP 输入，无 Proto/RPC/SDK 双轨。

当前6.0.0 artifact SHA256 `10ff7ee82ca7405dcab473f3fd80e620aa6c4e0bc92e64111797144ce0fa4061`；provenance SHA256 `ed2e312bc5bc3022111797771190e57133818af83c0bb7ad2024a615a4e033c5`。source commit由正式发布任务绑定，不预填未知commit。BFF/Agent/Admin/App 须固定本次 owner commit/version/artifact/provenance 并完成各自验证后配对；目前不宣称消费者或正常环境已切换，不在 Root 发布内部 API。

6.0.0的新增边界为两个明确操作：脱敏创建结果GET（原actor／发起tenant匹配）及Agent-only凭据只读POST（no-store、无幂等写入、无自动重试）。provider输入 `api_key` 标为writeOnly，拒caller自选handle；凭据明文只出现在后者。可接受的model-management operation闭集由现AccessGuard同一常量生成，不赋予其他域权限。

## Generation 与 breaking 策略

生成器是唯一派生入口，request 使用 Zod input、response 使用 output；artifact 禁止手改。5.0.0 相对4.0.0：revision 移除 feature_key，由业务 label/routing 引用共享修订；label display_name 可省略／null，PATCH 缺失不改／null 清别名；catalog 返回 tenant 有效 revision_id、真实 model/provider 身份与 request_model，display_name 默认原始请求模型名，不再返回全局 default_revision_id 冒充实际选择。resolve 仍返回受权 feature，不对空绑定扫描其他模型。

4.0.0 的 immutable direct/optional LiteLLM connection、context/output 两界、发布／CAS／幂等与83/2操作闭集保留；旧字段不保兼容 union 或别名推 provider。新 digest 不重写旧ID及历史事实；正常配对前备份盘点。6.0.0改为只写API Key创建、生成opaque引用、脱敏结果查询和Agent-only当前精确路由领取；只有新正式消费者配对后才启用，正常配置仍未切换；模型、实际工具与扣费仍暂停。

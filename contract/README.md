# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **5.0.0**，HTTP `/v1`；共享不可变模型修订，由各业务独立组合、选择和命名。83 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI；独立操作 inventory/schema 负例、drift、provenance 检查 20 个 HTTP 输入与 artifact digest。模块内部 cache schema 不属 HTTP 输入，无 Proto/RPC/SDK 双轨。

当前5.0.0 artifact SHA256 `a83b37269e9e4fa7fb5310a1836975e20ab9eaee965a66c83e35bb1ca1b9e5df`；provenance SHA256 `97b20e57f66010ba456fac59fe1dd62d90c17325c82d3da80be455ea9d3cf747`。source commit由正式发布任务绑定，不预填未知commit。BFF/Agent/Admin/App 须固定本次 owner commit/version/artifact/provenance 并完成各自验证后配对；目前不宣称消费者或正常环境已切换，不在 Root 发布内部 API。

## Generation 与 breaking 策略

生成器是唯一派生入口，request 使用 Zod input、response 使用 output；artifact 禁止手改。5.0.0 相对4.0.0：revision 移除 feature_key，由业务 label/routing 引用共享修订；label display_name 可省略／null，PATCH 缺失不改／null 清别名；catalog 返回 tenant 有效 revision_id、真实 model/provider 身份与 request_model，display_name 默认原始请求模型名，不再返回全局 default_revision_id 冒充实际选择。resolve 仍返回受权 feature，不对空绑定扫描其他模型。

4.0.0 的 immutable direct/optional LiteLLM connection、context/output 两界、发布／CAS／幂等与83/2操作闭集保留；旧字段不保兼容 union 或别名推 provider。新 digest 不重写旧ID及历史事实；正常配对前备份盘点。API Key 保存／读取是后继候选，不是本5.0.0契约已交付的能力；模型、实际工具与扣费仍暂停。

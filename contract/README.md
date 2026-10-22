# System internal-owner HTTP contract

Owner `kokoro-system`；visibility `internal-owner`；version **6.1.0**，HTTP `/v1`；共享不可变模型修订，由各业务独立组合、选择和命名。86 业务操作及 2 probes。

唯一方向：`src/modules/*/schemas/**/*.schema.ts` + `src/http/protocol.schema.ts` → `scripts/generate-system-openapi.ts` → 只读 `openapi/system.openapi.json`。操作 metadata 在 `scripts/system-openapi-operations.ts`；Controller 直接消费 schema，架构测试逐 method/path/CAS/scope/permission 核对。

```bash
pnpm contract:generate
pnpm contract:check
```

Redocly 校验真实 OpenAPI；独立操作 inventory/schema 负例、drift、provenance 检查 23 个正式输入／权限闭集来源与 artifact digest。模块内部 cache schema 不属 HTTP 输入，无 Proto/RPC/SDK 双轨。

当前6.1.0 artifact SHA256 `77792d3b31446a70adf25693bdea4bd9ebfd39f3b77c6816bc324591827ca758`；provenance SHA256 `2ee7006f2b6c5a87be422a70975750764b40b738261793d8569ed0cb4fb41c57`。source commit由正式发布任务绑定，不预填未知commit。新增 discovery 的 BFF 消费者须固定本次 owner commit/version/artifact/provenance，后继 App/Admin 再固定 BFF 正式发布物；原 Agent resolve/credential 操作和 schema 未变，可保持已验 6.0 固定消费者，不因管理端新增读取强制换 pin。目前不宣称消费者或正常环境已切换，不在 Root 发布内部 API。

6.0.0的新增边界为两个明确操作：脱敏创建结果GET（原actor／发起tenant匹配）及Agent-only凭据只读POST（no-store、无幂等写入、无自动重试）。provider输入 `api_key` 标为writeOnly，拒caller自选handle；凭据明文只出现在后者。可接受的model-management operation闭集由现AccessGuard同一常量生成，不赋予其他域权限。

6.1.0 在原6.0边界上仅新增显式GET `/v1/system/model-catalog/providers/{provider_id}/upstream-models`：global `system:write`，仅management/system-admin，需可信actor和tenant，无body/query/命令headers，no-store。data仅provider_id及items[{id}]，不返回Key/handle/上游URL，不写本地目录/健康/回执，不自动发布或执行模型；BFF须固定本次发布物后使用。原操作/schema由冻结6.0摘要逐项核验，不引入旧wire fallback。

## Generation 与 breaking 策略

生成器是唯一派生入口，request 使用 Zod input、response 使用 output；artifact 禁止手改。5.0.0 相对4.0.0：revision 移除 feature_key，由业务 label/routing 引用共享修订；label display_name 可省略／null，PATCH 缺失不改／null 清别名；catalog 返回 tenant 有效 revision_id、真实 model/provider 身份与 request_model，display_name 默认原始请求模型名，不再返回全局 default_revision_id 冒充实际选择。resolve 仍返回受权 feature，不对空绑定扫描其他模型。

4.0.0 的 immutable direct/optional LiteLLM connection、context/output 两界、发布／CAS／幂等与83/2操作闭集保留；旧字段不保兼容 union 或别名推 provider。新 digest 不重写旧ID及历史事实；正常配对前备份盘点。6.0.0改为只写API Key创建、生成opaque引用、脱敏结果查询和Agent-only当前精确路由领取；只有新正式消费者配对后才启用，正常配置仍未切换；模型、实际工具与扣费仍暂停。

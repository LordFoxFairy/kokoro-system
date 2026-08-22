# System Backend/Web Contract v1

状态：冻结；供 User Web、Admin Web、BFF 和后端 agent 使用。

## 1. 服务边界

`kokoro-system` 拥有 Product/Application、Navigation、Localization、Theme、Feature Flag、通用配置、Assignment reference 和 Runtime Manifest。

它不拥有 IAM 身份/权限、Payment、Credit、Model、Hub 或 Session 事实；Web 不直连 System MySQL/Redis。

## 2. Runtime Manifest API

```http
GET /system/runtime-manifest?product_id=PRODUCT_ID&locale=LOCALE&surface_id=SURFACE_ID
Host: TENANT_HOST
x-kokoro-tenant-id: TENANT_ID
x-kokoro-actor-id: ACTOR_ID       # optional
x-kokoro-request-id: REQUEST_ID
```

`surface_id` 可选，只是配置覆盖选择器，不是身份或授权边界。`x-kokoro-tenant-id` 只允许由受信 BFF/server-side context 传入；浏览器不能提交或决定它。

System 必须调用 IAM：

```http
GET IAM_BASE_URL/internal/iam/tenant-binding?host=TENANT_HOST
Authorization: Bearer BACKEND_WORKLOAD_TOKEN
```

IAM 返回的 tenant 必须等于请求 context 的 tenant；不一致、未知或禁用 Host 直接失败，且不得读取 MySQL/Redis 业务数据。

## 3. Response

```json
{
  "data": {
    "tenantId": "TENANT_ID",
    "productId": "PRODUCT_ID",
    "locale": "en-US",
    "navigation": [],
    "localeNamespaces": [],
    "theme": {},
    "featureFlags": [],
    "references": [],
    "configVersion": "1",
    "releaseId": null,
    "digest": "SHA256"
  }
}
```

`tenantId/productId/locale` 必须与请求解析结果一致。`digest` 是服务端组装结果的 SHA-256；客户端不自行拼装配置。

## 4. Scope and precedence

配置表为软删除、无外键、无业务 UNIQUE 索引。配置读取只接受以下 scope：

```text
surface > tenant > product > global
精确 locale > locale NULL
当前 release > release NULL
config_version > id
```

每个 `(module_key, config_key)` 只选择一个最高优先级记录。`tenant_id` 是唯一数据隔离键；System 不创建 Site 隔离轴。

## 5. Storage/runtime contract

- MySQL 是 release/config 最终事实。
- Redis 只缓存完整 Runtime Manifest。
- Redis key：`<namespace>:manifest:TENANT_ID:PRODUCT_ID:LOCALE`。
- Redis failure、cache identity mismatch 或 IAM binding failure：fail closed。
- 不使用进程内缓存或跨 tenant cache key。
- SQL 使用 InnoDB、UTC、软删除、应用层冲突处理、显式 scope 过滤。

## 6. HTTP error contract

```text
400  product_id/header/query 缺失或格式错误
404 未知路径
503 IAM、MySQL、Redis 或 manifest 读取不可用
```

响应不得泄露 SQL、Redis key、workload token、内部堆栈或其他服务私有事实。

## 7. Web agent acceptance

1. 只调用 BFF/API，不直连 System MySQL/Redis。
2. 不在浏览器保存或提交 `tenant_id`、workload token 或 IAM backend token。
3. Tenant A/B 使用相同 product/locale 时 cache 和 response 完全隔离。
4. 验证 tenant、locale、surface、release 的覆盖优先级和 digest 稳定性。
5. 验证 Redis miss、Redis failure、IAM mismatch、MySQL failure 的 fail-closed 行为。
6. 当前 System commit：`e20f8ba`。

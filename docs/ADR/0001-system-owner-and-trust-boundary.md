# ADR-0001: System owner 与受信 BFF 边界

- Status: Accepted
- Date: 2026-09-03
- Owners: kokoro-system

## Context

Kokoro 按事实 owner 拆分仓库。Site/Host/Workspace/Runtime Manifest/System Config/Release/Policy 若同时存在 IAM、BFF 或
System，会产生多租户隔离、Host resolution 和发布状态的多事实源。浏览器又不能被允许自行选择内部 tenant/permission。

## Decision

1. `kokoro-system` 是 Site、Site Host、Workspace、Product/Profile、System Config、Config Release/Binding、Site Policy、
   Runtime Manifest 与 System command receipt 的唯一 owner。
2. `tenant_id` 是跨仓 opaque isolation context；`site_id` 只在 System 内部作为资源 ID。
3. 浏览器只访问 Web same-origin adapter；BFF 完成 session/CSRF/IAM admission，再向 System 发送受服务认证保护的
   tenant/actor/organization/permission/Host context。
4. System 自己以 tenant + Host 查询本仓 Site/Host；不读取 IAM database，也不调用 IAM Host API。
5. PostgreSQL 是 durable source；Redis 只缓存完整 Runtime Manifest。依赖或 identity 不一致时 fail closed，不建立进程内
   第二事实源。

## Consequences

- BFF/service credential 与网络边界成为高价值控制；token rotation、TLS/mTLS 与 header stripping 必须由平台/BFF闭环。
- System 可在自己的 database 内维护 Site lineage 与 tenant-safe JOIN；跨 owner 只保存 opaque reference。
- Redis outage 会降低 Runtime Manifest availability，但不会造成 stale fallback 与 PostgreSQL 分叉。
- IAM 不需要复制 Site/Host 模型；System 也不存储 IAM permission facts。
- 当前 release binding、policy enforcement、credential rotation 等缺口仍需独立实现，见 `../CURRENT.md`。

## Alternatives rejected

- 把 Site/Host 放入 IAM：混淆身份 owner 与系统配置 owner。
- 由 BFF 直读 System database：绕过 contract/application/tenant boundary。
- 浏览器直连 System：会暴露 service credential 与受信 context controls。
- Redis/内存成为可降级事实源：在配置发布期间产生不可审计分叉。

## Verification

架构、HTTP、Runtime Manifest、Site Connect 与 tenant isolation tests 验证仓库内约束；是否在生产网络中真正隔离，仍需
deployment/network evidence。

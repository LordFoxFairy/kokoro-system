# ADR-0002: 本仓 contract authority 与 generated provenance

- Status: Accepted
- Date: 2026-09-03
- Owners: kokoro-system

## Context

Root 只拥有拓扑与治理。如果 Root、System 和 consumer 各维护一份可编辑 HTTP/protobuf DTO，字段、版本和 tenant boundary
会漂移；手改 generated output 也会切断 source provenance。

## Decision

1. `contract/openapi/system.openapi.json` 是 System HTTP machine source；`contract/proto/` 是 System protobuf source。
2. 每个 OpenAPI operation 声明 owner、visibility、stability、idempotency 与 permission metadata。
3. `src/generated/proto/` 只由本仓 Buf/protoc generation 产生，禁止手改；application 不依赖 generated wire type。
4. `contract/provenance.json` 验证本地 proto source digest；consumer 依赖版本固定的 artifact/commit/digest，不复制可编辑 source。
5. Root Developer API 门户不发布 System internal-owner contract，也不成为其字段事实源。
6. Breaking change 必须先改 owner contract、执行 lint/breaking review/generation/provenance/tests，再更新实现与 consumer。

## Consequences

- Contract review 先于 consumer/runtime 更新；generated drift 可在 owner repository 内定位。
- OpenAPI 与 proto 有独立版本语义，但都由 System owner 发布。
- System Proto 只保留运行时使用的 `kokoro.site.v1`；owner gate 拒绝重新声明 `kokoro.common.v1`，不复制 IAM、BFF
  或 Agent DTO。
- 当前 provenance 只覆盖 proto source，OpenAPI breaking diff、generated digest/source commit 尚未自动化；这些是记录在
  `../../contract/README.md` 的缺口，不被 ADR 文字视为已实现。
- 手写 TypeScript Runtime Manifest SDK 是 consumer adapter，不是第二份 schema authority。

## Alternatives rejected

- Root 保存跨仓 canonical proto/OpenAPI：违反事实 owner，增加双向同步。
- Consumer vendor 一份可编辑 DTO：无法证明来源和 breaking upgrade。
- 直接手改 generated TypeScript：下次 generation 会丢失且无法审计。
- 只在 Markdown 描述字段：缺少 machine validation 与 generation source。

## Verification

`pnpm contract:check`、contract-source tests、architecture tests 与 Root `kokoro-system` audit slice 验证当前仓结构。发布级
breaking/provenance 证据仍需按 `../../contract/README.md` 的缺口收敛。

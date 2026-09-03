# kokoro-system 子仓 Agent 规范

@../AGENTS.md

本仓是 System owner，负责 site、workspace、runtime manifest、system policy 和配置发布事实。规则已经明确时直接执行，不重复向用户确认。

- 目录按 `bootstrap/config/domain/application/infrastructure/interfaces` 分层，删除无 owner 的 `modules`/`common` 收纳层。
- 生产路径禁止默认装配 InMemory；内存替身只放 `test/fixtures/` 或 `test/doubles/`。
- 只保留唯一 canonical `database/schema.sql`；删除 migration runner、历史迁移目录和旧兼容入口。
- SQL 使用 PostgreSQL `$1, $2, ...` 参数绑定；禁止 `FOREIGN KEY`、`REFERENCES`；JOIN 只在本仓同 owner 数据库内执行并显式带 tenant 条件。
- 时间使用 `TIMESTAMPTZ(3)` 和 RFC 3339 UTC；纯日期使用 `DATE`，周期规则保存 IANA timezone。
- `contract/` 是 System owner 的 wire source；`src/generated/` 只保存可重生成的只读产物，契约检查必须验证本地 source 与 provenance。

完成前执行：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm db:apply-schema
```

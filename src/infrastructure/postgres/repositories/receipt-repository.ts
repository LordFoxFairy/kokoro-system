import { randomUUID } from "node:crypto";
import { PostgresRepository, json, text, timestamp } from "./support.js";
import type { Row } from "./support.js";

export class PostgresReceiptRepository extends PostgresRepository {
  public async get(tenantId: string, key: string): Promise<Readonly<{ requestHash: string; response: unknown }> | null> { return this.withTransaction(async (client) => { const result = await client.query<Row>("SELECT request_hash, response_json FROM system_command_receipt WHERE tenant_id = ? AND idempotency_key = ? ORDER BY created_at DESC, id DESC LIMIT 1", [tenantId, key]); const row = result.rows[0]; return row ? { requestHash: text(row.request_hash), response: json(row.response_json) } : null; }); }
  public async save(tenantId: string, key: string, requestHash: string, response: unknown): Promise<void> { await this.withTransaction(async (client) => { await client.query("INSERT INTO system_command_receipt (id, tenant_id, idempotency_key, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), tenantId, key, requestHash, JSON.stringify(response), timestamp()]); }); }
}

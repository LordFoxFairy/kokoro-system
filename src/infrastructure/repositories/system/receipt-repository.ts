import { randomUUID } from "node:crypto";
import type { SqlClient, SqlPool } from "../../persistence/postgres/client.js";
import { SystemDomainError } from "../../../domain/system/errors/system-domain.error.js";
import { PostgresRepository, utcTimestamp } from "./support.js";
import type { Row } from "./support.js";
import {
  decodeEnum,
  decodeJson,
  decodeString,
} from "../../persistence/postgres/value-decoders.js";

export type ReceiptClaim =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "completed"; response: unknown }>;

export class PostgresReceiptRepository extends PostgresRepository {
  public constructor(pool: SqlPool, transactionClient: SqlClient | null = null) {
    super(pool, transactionClient);
  }

  public async claim(
    tenantId: string,
    key: string,
    requestHash: string,
  ): Promise<ReceiptClaim> {
    return this.withTransaction(async (client) => {
      const inserted = await client.query(
        "INSERT INTO system_command_receipt (id, tenant_id, idempotency_key, request_hash, status, response_json, created_at, completed_at) VALUES ($1, $2, $3, $4, 'pending', NULL, $5, NULL) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING",
        [randomUUID(), tenantId, key, requestHash, utcTimestamp()],
      );
      const result = await client.query<Row>(
        "SELECT request_hash, status, response_json FROM system_command_receipt WHERE tenant_id = $1 AND idempotency_key = $2 LIMIT 1 FOR UPDATE",
        [tenantId, key],
      );
      const row = result.rows[0];
      if (!row)
        throw new SystemDomainError(
          "SYSTEM_UNAVAILABLE",
          "command receipt claim failed",
          503,
        );
      if (
        decodeString(row.request_hash, "system_command_receipt.request_hash") !==
        requestHash
      )
        throw new SystemDomainError(
          "IDEMPOTENCY_KEY_REUSED",
          "idempotency key was used with a different request",
          409,
        );
      const status = decodeEnum(
        row.status,
        "system_command_receipt.status",
        ["pending", "completed"],
      );
      if (status === "completed")
        return {
          kind: "completed",
          response: decodeJson(
            row.response_json,
            "system_command_receipt.response_json",
          ),
        };
      if (inserted.affectedRows !== 1)
        throw new SystemDomainError(
          "SYSTEM_UNAVAILABLE",
          "command receipt is incomplete",
          503,
        );
      return { kind: "claimed" };
    });
  }

  public async complete(
    tenantId: string,
    key: string,
    requestHash: string,
    response: unknown,
  ): Promise<void> {
    await this.withTransaction(async (client) => {
      const updated = await client.query(
        "UPDATE system_command_receipt SET status = 'completed', response_json = $1, completed_at = $2 WHERE tenant_id = $3 AND idempotency_key = $4 AND request_hash = $5 AND status = 'pending'",
        [
          JSON.stringify(response),
          utcTimestamp(),
          tenantId,
          key,
          requestHash,
        ],
      );
      if (updated.affectedRows !== 1)
        throw new SystemDomainError(
          "SYSTEM_UNAVAILABLE",
          "command receipt completion failed",
          503,
        );
    });
  }
}

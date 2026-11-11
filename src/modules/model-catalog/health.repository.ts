import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import { healthSchema } from "./schemas/provider.schema.js";
const columns = "provider_id,status,observed_at,generation,updated_at";
@Injectable()
export class HealthRepository {
  public async find(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_provider_health_state WHERE provider_id=$1 FOR UPDATE`,
      [id],
    );
    return result.rows[0] ? decodeRow(healthSchema, result.rows[0]) : null;
  }
  public async put(
    tx: TransactionContext,
    id: string,
    input: { status: string; observed_at: string },
  ) {
    const result = await tx.query(
      `INSERT INTO model_provider_health_state(provider_id,status,observed_at) VALUES($1,$2,$3) ON CONFLICT(provider_id) DO UPDATE SET status=EXCLUDED.status,observed_at=EXCLUDED.observed_at,generation=model_provider_health_state.generation+1,updated_at=CURRENT_TIMESTAMP(3) RETURNING ${columns}`,
      [id, input.status, input.observed_at],
    );
    return decodeRow(healthSchema, result.rows[0]!);
  }
  // Caller holds provider then health locks. The observation time is captured
  // when the network result completes, never refreshed after a long lock wait.
  public async refresh(
    tx: TransactionContext,
    id: string,
    observedAt: string,
    maxAge: number,
  ) {
    const result = await tx.query(
      `INSERT INTO model_provider_health_state(provider_id,status,observed_at) SELECT $1,'healthy',$2::timestamptz WHERE $2::timestamptz>clock_timestamp()-($3::bigint*INTERVAL '1 millisecond') AND $2::timestamptz<=clock_timestamp()+INTERVAL '5 seconds' ON CONFLICT(provider_id) DO UPDATE SET status='healthy',observed_at=EXCLUDED.observed_at,generation=model_provider_health_state.generation+1,updated_at=CURRENT_TIMESTAMP(3) WHERE model_provider_health_state.observed_at<=clock_timestamp()-($3::bigint*INTERVAL '1 millisecond') RETURNING ${columns}`,
      [id, observedAt, maxAge],
    );
    return result.rowCount === 1;
  }
}

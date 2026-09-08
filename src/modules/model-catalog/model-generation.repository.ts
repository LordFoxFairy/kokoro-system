import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class ModelGenerationRepository {
  public async advance(tx: TransactionContext): Promise<void> {
    await tx.query(
      "UPDATE model_cache_generation SET generation=generation+1,updated_at=CURRENT_TIMESTAMP(3) WHERE scope='resolve'",
    );
  }
  public async read(tx: TransactionContext, tenant: string) {
    const result = await tx.query<{
      generation: string;
      tenant_generation: string;
    }>(
      "SELECT (SELECT generation::text FROM model_cache_generation WHERE scope='resolve') AS generation,COALESCE((SELECT generation FROM system_runtime_manifest_generation WHERE tenant_id=$1),1)::text AS tenant_generation",
      [tenant],
    );
    return result.rows[0]!;
  }
}

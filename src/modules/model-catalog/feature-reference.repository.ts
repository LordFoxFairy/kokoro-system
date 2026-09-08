import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { SystemError } from "../../system.error.js";
@Injectable()
export class FeatureReferenceRepository {
  public async lock(tx: TransactionContext, keys: string[]) {
    const unique = [...new Set(keys)];
    await tx.query(
      "SELECT p.id FROM system_product p WHERE p.id IN (SELECT product_id FROM system_feature_definition WHERE global_feature_key=ANY($1::text[])) ORDER BY p.id FOR UPDATE",
      [unique],
    );
    const result = await tx.query<{ id: string }>(
      "SELECT f.id FROM system_feature_definition f JOIN system_product p ON p.id=f.product_id WHERE f.global_feature_key=ANY($1::text[]) AND f.retired_at IS NULL AND p.deleted_at IS NULL AND p.status='active' ORDER BY f.id FOR UPDATE OF f",
      [unique],
    );
    if (result.rows.length !== unique.length)
      throw new SystemError("INVALID_STATE", "Feature is unavailable");
  }
}

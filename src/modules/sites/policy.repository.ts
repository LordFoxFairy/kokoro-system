import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import { policySchema } from "./schemas/policy.schema.js";
import type { policyInputSchema } from "./schemas/policy.schema.js";
import { OwnerError } from "../../http/owner-error.js";
const columns =
  "id,tenant_id,site_id,version,status,default_locale,allowed_locales_json AS allowed_locales,allowed_products_json AS allowed_products,public_manifest,updated_at";
@Injectable()
export class PolicyRepository {
  public async find(tx: TransactionContext, tenant: string, siteId: string) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_site_policy WHERE tenant_id=$1 AND site_id=$2 AND status='active'`,
      [tenant, siteId],
    );
    return result.rows[0] ? decodeRow(policySchema, result.rows[0]) : null;
  }
  public async save(
    tx: TransactionContext,
    tenant: string,
    siteId: string,
    input: z.infer<typeof policyInputSchema>,
  ) {
    const productKeys = [...new Set(input.allowed_products)];
    const products = await tx.query<{ id: string }>(
      "SELECT id FROM system_product WHERE product_key=ANY($1::text[]) AND status='active' AND deleted_at IS NULL ORDER BY id FOR UPDATE",
      [productKeys],
    );
    if (products.rows.length !== productKeys.length)
      throw new OwnerError(
        "POLICY_INVALID",
        "Policy references unavailable product",
        409,
      );
    const result = await tx.query(
      `INSERT INTO system_site_policy (id,tenant_id,site_id,status,default_locale,allowed_locales_json,allowed_products_json,public_manifest) VALUES ($1,$2,$3,'active',$4,$5,$6,$7) ON CONFLICT (tenant_id,site_id) WHERE status='active' DO UPDATE SET default_locale=EXCLUDED.default_locale,allowed_locales_json=EXCLUDED.allowed_locales_json,allowed_products_json=EXCLUDED.allowed_products_json,public_manifest=EXCLUDED.public_manifest,version=system_site_policy.version+1,updated_at=CURRENT_TIMESTAMP(3) RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        siteId,
        input.default_locale,
        JSON.stringify(input.allowed_locales),
        JSON.stringify(input.allowed_products),
        input.public_manifest,
      ],
    );
    return decodeRow(policySchema, result.rows[0]!);
  }
}

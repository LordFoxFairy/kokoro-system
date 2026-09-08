import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { exposureSchema } from "./schemas/feature.schema.js";
const columns =
  "id,tenant_id,application_id,feature_id,enabled,display_order,version,created_at,updated_at";
@Injectable()
export class ExposureRepository {
  public async find(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    featureId: string,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_app_feature_exposure WHERE tenant_id=$1 AND application_id=$2 AND feature_id=$3 FOR UPDATE`,
      [tenant, appId, featureId],
    );
    return result.rows[0] ? decodeRow(exposureSchema, result.rows[0]) : null;
  }
  public async list(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    query: PageQuery,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_app_feature_exposure WHERE tenant_id=$1 AND application_id=$2 AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid)) ORDER BY created_at DESC,id DESC LIMIT $5`,
      [
        tenant,
        appId,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(exposureSchema, row));
  }
  public async put(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    featureId: string,
    input: { enabled: boolean; display_order: number },
  ) {
    const result = await tx.query(
      `INSERT INTO system_app_feature_exposure(id,tenant_id,application_id,feature_id,enabled,display_order) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,application_id,feature_id) DO UPDATE SET enabled=EXCLUDED.enabled,display_order=EXCLUDED.display_order,version=system_app_feature_exposure.version+1,updated_at=CURRENT_TIMESTAMP(3) RETURNING ${columns}`,
      [
        randomUUID(),
        tenant,
        appId,
        featureId,
        input.enabled,
        input.display_order,
      ],
    );
    return decodeRow(exposureSchema, result.rows[0]!);
  }
  public async remove(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    featureId: string,
  ) {
    const result = await tx.query(
      `DELETE FROM system_app_feature_exposure WHERE tenant_id=$1 AND application_id=$2 AND feature_id=$3 RETURNING ${columns}`,
      [tenant, appId, featureId],
    );
    return decodeRow(exposureSchema, result.rows[0]!);
  }
}

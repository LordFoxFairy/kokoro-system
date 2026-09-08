import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class ResolveRepository {
  public async policy(
    tx: TransactionContext,
    tenant: string,
    feature: string,
    label: string | undefined,
  ) {
    const result = await tx.query<{
      label_key: string;
      feature_key: string;
      visible: boolean;
      revision_id: string | null;
    }>(
      "SELECT l.label_key,l.feature_key,p.visible,COALESCE(p.model_revision_id,l.default_revision_id) AS revision_id FROM model_routing_policy p JOIN model_label l ON l.id=p.label_id AND l.feature_key=p.feature_key JOIN system_feature_definition f ON f.global_feature_key=l.feature_key JOIN system_product pr ON pr.id=f.product_id WHERE p.tenant_id=$1 AND p.feature_key=$2 AND l.deleted_at IS NULL AND f.retired_at IS NULL AND pr.deleted_at IS NULL AND pr.status='active' AND (($3::text IS NULL AND p.is_default) OR l.label_key=$3) ORDER BY p.id LIMIT 1",
      [tenant, feature, label ?? null],
    );
    return result.rows[0] ?? null;
  }
  public async candidate(
    tx: TransactionContext,
    feature: string,
    pinned: string | null,
    maxAge: number,
  ) {
    const result = await tx.query<{
      model_id: string;
      revision_id: string;
      revision: number;
      digest: string;
      provider_id: string;
      provider_model_name: string;
      transport: "litellm";
      gateway_model_name: string;
      health_valid_until: Date;
    }>(
      "SELECT r.model_id,r.id AS revision_id,r.revision,r.digest,r.provider_id,r.provider_model_name,r.transport,r.gateway_model_name,h.observed_at+($3::bigint*INTERVAL '1 millisecond') AS health_valid_until FROM model_revision r JOIN model_definition m ON m.id=r.model_id JOIN model_provider p ON p.id=r.provider_id JOIN model_provider_health_state h ON h.provider_id=p.id WHERE r.feature_key=$1 AND ($2::uuid IS NULL OR r.id=$2) AND r.published_at IS NOT NULL AND r.retired_at IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND r.transport='litellm' AND p.transport='litellm' AND h.status='healthy' AND h.observed_at>CURRENT_TIMESTAMP-($3::bigint*INTERVAL '1 millisecond') AND h.observed_at<=CURRENT_TIMESTAMP+INTERVAL '5 seconds' ORDER BY r.priority,r.id LIMIT 1",
      [feature, pinned, maxAge],
    );
    return result.rows[0] ?? null;
  }
}

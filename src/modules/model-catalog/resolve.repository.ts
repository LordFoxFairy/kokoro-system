import type { z } from "zod";
import type { connectionSchema } from "./schemas/connection.schema.js";
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
    pinned: string,
    maxAge: number,
    allowLoopbackHttp: boolean,
  ) {
    const result = await tx.query<{
      model_id: string;
      revision_id: string;
      revision: number;
      digest: string;
      provider_id: string;
      provider_model_name: string;
      request_model: string;
      connection: z.infer<typeof connectionSchema>;
      context_window: number;
      max_output_tokens: number;
      health_valid_until: Date;
    }>(
      "SELECT r.model_id,r.id AS revision_id,r.revision,r.digest,r.provider_id,r.provider_model_name,r.request_model,jsonb_build_object('protocol',r.connection_protocol,'connection_type',r.connection_type,'base_url',r.connection_base_url,'secret_handle_ref',r.connection_secret_handle_ref) AS connection,r.context_window,r.max_output_tokens,h.observed_at+($2::bigint*INTERVAL '1 millisecond') AS health_valid_until FROM model_revision r JOIN model_definition m ON m.id=r.model_id JOIN model_provider p ON p.id=r.provider_id JOIN model_provider_health_state h ON h.provider_id=p.id WHERE r.id=$1 AND r.published_at IS NOT NULL AND r.retired_at IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND r.context_window IS NOT NULL AND r.max_output_tokens IS NOT NULL AND r.max_output_tokens<=r.context_window AND ($3::boolean OR r.connection_base_url LIKE 'https://%') AND p.secret_handle_ref<>'' AND h.status='healthy' AND h.observed_at>CURRENT_TIMESTAMP-($2::bigint*INTERVAL '1 millisecond') AND h.observed_at<=CURRENT_TIMESTAMP+INTERVAL '5 seconds'",
      [pinned, maxAge, allowLoopbackHttp],
    );
    return result.rows[0] ?? null;
  }
  // Health is the only missing eligibility fact. Do not probe arbitrary providers
  // or turn an unbound/draft/retired/erased route into an executable selection.
  public async probeTarget(
    tx: TransactionContext,
    pinned: string,
    maxAge: number,
    allowLoopbackHttp: boolean,
  ) {
    const result = await tx.query<{
      provider_id: string;
      health_generation: string | null;
    }>(
      "SELECT p.id AS provider_id,h.generation::text AS health_generation FROM model_revision r JOIN model_definition m ON m.id=r.model_id JOIN model_provider p ON p.id=r.provider_id JOIN model_provider_credential c ON c.provider_id=p.id AND c.secret_handle_ref=p.secret_handle_ref AND c.secret_handle_ref=r.connection_secret_handle_ref LEFT JOIN model_provider_health_state h ON h.provider_id=p.id WHERE r.id=$1 AND r.published_at IS NOT NULL AND r.retired_at IS NULL AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND c.erased_at IS NULL AND r.context_window IS NOT NULL AND r.max_output_tokens IS NOT NULL AND r.max_output_tokens<=r.context_window AND ($3::boolean OR r.connection_base_url LIKE 'https://%') AND p.secret_handle_ref<>'' AND (h.provider_id IS NULL OR h.observed_at<=clock_timestamp()-($2::bigint*INTERVAL '1 millisecond'))",
      [pinned, maxAge, allowLoopbackHttp],
    );
    return result.rows[0] ?? null;
  }
}

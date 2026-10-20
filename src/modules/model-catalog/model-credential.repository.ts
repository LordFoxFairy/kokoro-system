import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import type { SealedModelCredential } from "./model-credential-crypto.js";
import type { credentialReadInputSchema } from "./schemas/credential.schema.js";
@Injectable()
export class ModelCredentialRepository {
  public async hasCreation(
    tx: TransactionContext,
    key: string,
  ): Promise<boolean> {
    const result = await tx.query(
      "SELECT provider_id FROM model_provider_credential WHERE creation_key=$1",
      [key],
    );
    return result.rows.length !== 0;
  }
  public async create(
    tx: TransactionContext,
    provider: string,
    reference: string,
    key: string,
    actor: string,
    tenant: string,
    sealed: SealedModelCredential,
  ) {
    await tx.query(
      "INSERT INTO model_provider_credential(provider_id,secret_handle_ref,creation_key,creation_actor_id,creation_tenant_id,nonce,auth_tag,ciphertext) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        provider,
        reference,
        key,
        actor,
        tenant,
        sealed.nonce,
        sealed.auth_tag,
        sealed.ciphertext,
      ],
    );
  }
  public async creation(
    tx: TransactionContext,
    key: string,
    actor: string,
    tenant: string,
  ) {
    const result = await tx.query<{
      provider_id: string;
      credential_status: "stored" | "erased";
      deleted_at: Date | null;
    }>(
      "SELECT c.provider_id,CASE WHEN c.erased_at IS NULL THEN 'stored' ELSE 'erased' END AS credential_status,p.deleted_at FROM model_provider_credential c JOIN model_provider p ON p.id=c.provider_id WHERE c.creation_key=$1 AND c.creation_actor_id=$2 AND c.creation_tenant_id=$3",
      [key, actor, tenant],
    );
    return result.rows[0] ?? null;
  }
  public async currentCredential(
    tx: TransactionContext,
    tenant: string,
    input: z.infer<typeof credentialReadInputSchema>,
    maxAge: number,
    allowLoopback: boolean,
  ) {
    // Serialize with provider deletion/erasure, then take ONE fresh authorization
    // snapshot. The requested revision is compared, never used to pick the route.
    await tx.query("SELECT id FROM model_provider WHERE id=$1 FOR UPDATE", [
      input.provider_id,
    ]);
    const result = await tx.query<
      SealedModelCredential & {
        provider_id: string;
        revision_id: string;
        digest: string;
        secret_handle_ref: string;
        feature_key: string;
        label_key: string;
      }
    >(
      `
      SELECT p.id AS provider_id,r.id AS revision_id,r.digest,c.secret_handle_ref,l.feature_key,l.label_key,c.nonce,c.auth_tag,c.ciphertext
      FROM model_routing_policy rp
      JOIN model_label l ON l.id=rp.label_id AND l.feature_key=rp.feature_key
      JOIN system_feature_definition f ON f.global_feature_key=l.feature_key
      JOIN system_product pr ON pr.id=f.product_id
      JOIN model_revision r ON r.id=COALESCE(rp.model_revision_id,l.default_revision_id)
      JOIN model_definition m ON m.id=r.model_id
      JOIN model_provider p ON p.id=r.provider_id
      JOIN model_provider_credential c ON c.provider_id=p.id AND c.secret_handle_ref=p.secret_handle_ref AND c.secret_handle_ref=r.connection_secret_handle_ref
      JOIN model_provider_health_state h ON h.provider_id=p.id
      WHERE rp.tenant_id=$1 AND rp.feature_key=$2 AND rp.visible
        AND (($3::text IS NULL AND rp.is_default) OR l.label_key=$3)
        AND l.deleted_at IS NULL AND f.retired_at IS NULL AND pr.deleted_at IS NULL AND pr.status='active'
        AND m.deleted_at IS NULL AND p.deleted_at IS NULL AND c.erased_at IS NULL
        AND r.published_at IS NOT NULL AND r.retired_at IS NULL
        AND r.context_window IS NOT NULL AND r.max_output_tokens IS NOT NULL AND r.max_output_tokens<=r.context_window
        AND ($7::boolean OR r.connection_base_url LIKE 'https://%')
        AND h.status='healthy' AND h.observed_at>clock_timestamp()-($8::bigint*INTERVAL '1 millisecond') AND h.observed_at<=clock_timestamp()+INTERVAL '5 seconds'
        AND p.id=$4 AND r.id=$5 AND r.digest=$6
      ORDER BY rp.id LIMIT 1`,
      [
        tenant,
        input.feature_key,
        input.label_key ?? null,
        input.provider_id,
        input.revision_id,
        input.digest,
        allowLoopback,
        maxAge,
      ],
    );
    return result.rows[0] ?? null;
  }
}

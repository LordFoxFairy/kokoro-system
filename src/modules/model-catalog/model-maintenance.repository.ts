import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class ModelMaintenanceRepository {
  public async reconcile(tx: TransactionContext): Promise<number> {
    const revisions = await tx.query(
      `SELECT r.id FROM model_revision r WHERE NOT EXISTS(SELECT 1 FROM model_definition m WHERE m.id=r.model_id) OR NOT EXISTS(SELECT 1 FROM model_provider p WHERE p.id=r.provider_id) OR NOT EXISTS(SELECT 1 FROM system_feature_definition f WHERE f.global_feature_key=r.feature_key) LIMIT 1000`,
    );
    const labels = await tx.query(
      `SELECT l.id FROM model_label l WHERE NOT EXISTS(SELECT 1 FROM system_feature_definition f WHERE f.global_feature_key=l.feature_key) OR (l.deleted_at IS NULL AND l.default_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM model_revision r WHERE r.id=l.default_revision_id AND r.feature_key=l.feature_key AND r.published_at IS NOT NULL AND r.retired_at IS NULL)) LIMIT 1000`,
    );
    const routing = await tx.query(
      `SELECT p.id FROM model_routing_policy p WHERE NOT EXISTS(SELECT 1 FROM model_label l WHERE l.id=p.label_id AND l.feature_key=p.feature_key AND l.deleted_at IS NULL) OR (p.model_revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM model_revision r WHERE r.id=p.model_revision_id AND r.feature_key=p.feature_key AND r.published_at IS NOT NULL AND r.retired_at IS NULL)) LIMIT 1000`,
    );
    const health = await tx.query(
      `SELECT h.provider_id FROM model_provider_health_state h WHERE NOT EXISTS(SELECT 1 FROM model_provider p WHERE p.id=h.provider_id AND p.deleted_at IS NULL) LIMIT 1000`,
    );
    return (
      revisions.rows.length +
      labels.rows.length +
      routing.rows.length +
      health.rows.length
    );
  }
  public async purge(tx: TransactionContext): Promise<number> {
    // Keep natural-key and immutable identities forever; only erase expired credential handles.
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM model_provider WHERE deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' AND secret_handle_ref<>'' ORDER BY id LIMIT 1000 FOR UPDATE SKIP LOCKED`,
    );
    for (const row of rows.rows)
      await tx.query(
        "UPDATE model_provider SET secret_handle_ref='' WHERE id=$1",
        [row.id],
      );
    return rows.rows.length;
  }
}

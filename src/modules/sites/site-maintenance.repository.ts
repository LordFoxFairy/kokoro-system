import type { DatabaseService } from "../../database/database.service.js";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class SiteMaintenanceRepository {
  public async reconcile(tx: TransactionContext): Promise<number> {
    const hosts = await tx.query(
      `SELECT h.id FROM system_site_host h WHERE h.status='active' AND NOT EXISTS(SELECT 1 FROM system_site s WHERE s.id=h.site_id AND s.tenant_id=h.tenant_id AND s.deleted_at IS NULL) LIMIT 1000`,
    );
    const policies = await tx.query(
      `SELECT p.id FROM system_site_policy p WHERE p.status='active' AND NOT EXISTS(SELECT 1 FROM system_site s WHERE s.id=p.site_id AND s.tenant_id=p.tenant_id AND s.deleted_at IS NULL) LIMIT 1000`,
    );
    return hosts.rows.length + policies.rows.length;
  }
  public async purge(database: DatabaseService): Promise<number> {
    const rows = await database.read(
      async (tx) =>
        await tx.query<{ id: string }>(
          `SELECT id FROM system_site WHERE deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY id LIMIT 1000`,
        ),
    );
    let count = 0;
    for (const row of rows.rows) {
      await database.transaction(async (tx) => {
        if (
          !(
            await tx.query(
              "SELECT id FROM system_site WHERE id=$1 AND deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' FOR UPDATE SKIP LOCKED",
              [row.id],
            )
          ).rows.length
        )
          return;

        const refs = await tx.query(
          `SELECT 1 WHERE EXISTS(SELECT 1 FROM system_workspace WHERE site_id=$1) OR EXISTS(SELECT 1 FROM system_application WHERE site_id=$1) OR EXISTS(SELECT 1 FROM system_config_record WHERE site_id=$1) OR EXISTS(SELECT 1 FROM system_release_binding WHERE site_id=$1)`,
          [row.id],
        );
        if (refs.rows.length) return;
        await tx.query("DELETE FROM system_site_host WHERE site_id=$1", [
          row.id,
        ]);
        await tx.query("DELETE FROM system_site_policy WHERE site_id=$1", [
          row.id,
        ]);
        count +=
          (await tx.query("DELETE FROM system_site WHERE id=$1", [row.id]))
            .rowCount ?? 0;
      });
    }
    const hosts = await database.read(
      async (tx) =>
        await tx.query<{ id: string; site_id: string }>(
          `SELECT id,site_id FROM system_site_host WHERE status='archived' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY site_id,id LIMIT 1000`,
        ),
    );
    for (const row of hosts.rows) {
      await database.transaction(async (tx) => {
        await tx.query("SELECT id FROM system_site WHERE id=$1 FOR UPDATE", [
          row.site_id,
        ]);
        count +=
          (
            await tx.query(
              "DELETE FROM system_site_host WHERE id=$1 AND status='archived' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '30 days'",
              [row.id],
            )
          ).rowCount ?? 0;
      });
    }
    return count;
  }
}

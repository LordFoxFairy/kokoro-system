import type { DatabaseService } from "../../database/database.service.js";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class WorkspaceMaintenanceRepository {
  public async reconcile(tx: TransactionContext): Promise<number> {
    return (
      await tx.query(
        `SELECT w.id FROM system_workspace w WHERE w.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM system_site s WHERE s.id=w.site_id AND s.tenant_id=w.tenant_id AND s.deleted_at IS NULL) LIMIT 1000`,
      )
    ).rows.length;
  }
  public async purge(database: DatabaseService): Promise<number> {
    const candidates = await database.read(
      async (tx) =>
        await tx.query<{
          id: string;
          site_id: string;
          tenant_id: string;
        }>(
          `SELECT id,site_id,tenant_id FROM system_workspace WHERE deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY site_id,id LIMIT 1000`,
        ),
    );
    let count = 0;
    for (const row of candidates.rows) {
      await database.transaction(async (tx) => {
        await tx.query(
          "SELECT id FROM system_site WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
          [row.site_id, row.tenant_id],
        );
        const locked = await tx.query(
          "SELECT id FROM system_workspace WHERE id=$1 AND deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' FOR UPDATE SKIP LOCKED",
          [row.id],
        );
        if (locked.rows.length)
          count +=
            (
              await tx.query("DELETE FROM system_workspace WHERE id=$1", [
                row.id,
              ])
            ).rowCount ?? 0;
      });
    }
    return count;
  }
}

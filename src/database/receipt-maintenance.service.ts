import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
@Injectable()
export class ReceiptMaintenanceService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  public purge(): Promise<number> {
    return this.database.transaction(async (tx) => {
      const result = await tx.query(
        `WITH expired AS (SELECT id FROM system_command_receipt WHERE status='completed' AND expires_at<CURRENT_TIMESTAMP ORDER BY expires_at,id LIMIT 1000 FOR UPDATE SKIP LOCKED) DELETE FROM system_command_receipt WHERE id IN(SELECT id FROM expired)`,
      );
      return result.rowCount ?? 0;
    });
  }
}

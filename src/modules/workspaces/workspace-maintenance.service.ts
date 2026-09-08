import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { WorkspaceMaintenanceRepository } from "./workspace-maintenance.repository.js";
@Injectable()
export class WorkspaceMaintenanceService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WorkspaceMaintenanceRepository)
    private readonly repository: WorkspaceMaintenanceRepository,
  ) {}
  public async maintain(hold: boolean) {
    const orphans = await this.database.read((tx) =>
      this.repository.reconcile(tx),
    );
    const purged = hold ? 0 : await this.repository.purge(this.database);
    return { orphans, purged };
  }
}

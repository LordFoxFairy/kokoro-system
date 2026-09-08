import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ModelMaintenanceRepository } from "./model-maintenance.repository.js";
@Injectable()
export class ModelMaintenanceService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ModelMaintenanceRepository)
    private readonly repository: ModelMaintenanceRepository,
  ) {}
  public async maintain(hold: boolean) {
    const orphans = await this.database.read((tx) =>
      this.repository.reconcile(tx),
    );
    const purged = hold
      ? 0
      : await this.database.transaction((tx) => this.repository.purge(tx));
    return { orphans, purged };
  }
}

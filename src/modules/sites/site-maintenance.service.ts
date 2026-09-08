import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { SiteMaintenanceRepository } from "./site-maintenance.repository.js";
@Injectable()
export class SiteMaintenanceService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SiteMaintenanceRepository)
    private readonly repository: SiteMaintenanceRepository,
  ) {}
  public async maintain(hold: boolean) {
    const orphans = await this.database.read((tx) =>
      this.repository.reconcile(tx),
    );
    const purged = hold ? 0 : await this.repository.purge(this.database);
    return { orphans, purged };
  }
}

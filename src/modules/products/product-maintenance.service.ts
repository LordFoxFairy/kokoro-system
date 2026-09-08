import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { ProductMaintenanceRepository } from "./product-maintenance.repository.js";
@Injectable()
export class ProductMaintenanceService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductMaintenanceRepository)
    private readonly repository: ProductMaintenanceRepository,
  ) {}
  public async maintain(hold: boolean) {
    const orphans = await this.database.read((tx) =>
      this.repository.reconcile(tx),
    );
    const purged = hold ? 0 : await this.repository.purge(this.database);
    return { orphans, purged };
  }
}

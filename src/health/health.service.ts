import { Injectable, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { CacheService } from "../cache/cache.service.js";
import { SystemError } from "../system.error.js";
@Injectable()
export class HealthService {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  public live() {
    return { service: "kokoro-system", status: "ok" };
  }
  public async ready() {
    if (!(await this.database.ready()) || !(await this.cache.ready()))
      throw new SystemError(
        "SYSTEM_UNAVAILABLE",
        "Dependencies unavailable",
        true,
      );
    return { service: "kokoro-system", status: "ready" };
  }
}

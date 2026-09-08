import { Controller, Get, Inject } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { CacheService } from "../cache/cache.service.js";
import { OwnerError } from "../http/owner-error.js";
@Controller()
export class HealthController {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}
  @Get("healthz") public live() {
    return { service: "kokoro-system", status: "ok" };
  }
  @Get("readyz") public async ready() {
    if (!(await this.database.ready()) || !(await this.cache.ready()))
      throw new OwnerError(
        "SYSTEM_UNAVAILABLE",
        "Dependencies unavailable",
        503,
        true,
      );
    return { service: "kokoro-system", status: "ready" };
  }
}

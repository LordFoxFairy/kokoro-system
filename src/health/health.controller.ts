import { Controller, Get, Inject } from "@nestjs/common";
import { HealthService } from "./health.service.js";
@Controller()
export class HealthController {
  public constructor(
    @Inject(HealthService) private readonly health: HealthService,
  ) {}
  @Get("healthz") public live() {
    return this.health.live();
  }
  @Get("readyz") public ready() {
    return this.health.ready();
  }
}

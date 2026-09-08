import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { CacheModule } from "../cache/cache.module.js";
import { HealthController } from "./health.controller.js";
@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [HealthController],
})
export class HealthModule {}

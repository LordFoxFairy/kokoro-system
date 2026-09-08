import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { CommandReceipt } from "./command-receipt.js";
@Module({
  providers: [DatabaseService, CommandReceipt],
  exports: [DatabaseService, CommandReceipt],
})
export class DatabaseModule {}

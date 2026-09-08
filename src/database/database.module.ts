import { ReceiptMaintenanceService } from "./receipt-maintenance.service.js";
import { Module } from "@nestjs/common";
import { DatabaseService } from "./database.service.js";
import { CommandReceipt } from "./command-receipt.js";
@Module({
  providers: [ReceiptMaintenanceService, DatabaseService, CommandReceipt],
  exports: [ReceiptMaintenanceService, DatabaseService, CommandReceipt],
})
export class DatabaseModule {}

import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { SystemConfig } from "../config/system-config.js";
import { ReceiptMaintenanceService } from "../database/receipt-maintenance.service.js";
import { SiteMaintenanceService } from "../modules/sites/sites.public.js";
import { WorkspaceMaintenanceService } from "../modules/workspaces/workspaces.public.js";
import { ProductMaintenanceService } from "../modules/products/products.public.js";
import { ModelMaintenanceService } from "../modules/model-catalog/model-catalog.public.js";
import { withRequestBudget } from "../http/request-budget.js";
import { lifecycleLog } from "../http/structured-logger.js";
@Injectable()
export class MaintenanceService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: NodeJS.Timeout | undefined;
  private pending: Promise<{ orphans: number; purged: number }> | undefined;
  private controller: AbortController | undefined;
  private stopped = false;
  public constructor(
    @Inject(SystemConfig) private readonly config: SystemConfig,
    @Inject(ReceiptMaintenanceService)
    private readonly receipts: ReceiptMaintenanceService,
    @Inject(WorkspaceMaintenanceService)
    private readonly workspaces: WorkspaceMaintenanceService,
    @Inject(ProductMaintenanceService)
    private readonly products: ProductMaintenanceService,
    @Inject(SiteMaintenanceService)
    private readonly sites: SiteMaintenanceService,
    @Inject(ModelMaintenanceService)
    private readonly models: ModelMaintenanceService,
  ) {}
  public onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.runOnce().catch(() => undefined);
    }, this.config.values.KOKORO_SYSTEM_MAINTENANCE_INTERVAL_MS);
    this.timer.unref();
  }
  public runOnce(): Promise<{ orphans: number; purged: number }> {
    if (this.pending) return this.pending;
    if (this.stopped) return Promise.reject(new Error("Maintenance draining"));
    const controller = new AbortController();
    this.controller = controller;
    const deadline = Math.min(
      5000,
      this.config.values.KOKORO_SYSTEM_SHUTDOWN_DEADLINE_MS,
    );
    const timer = setTimeout(
      () => controller.abort(new Error("Maintenance deadline")),
      deadline,
    );
    timer.unref();
    this.pending = withRequestBudget(
      { signal: controller.signal, deadline: Date.now() + deadline },
      async () => {
        const started = Date.now(),
          requestId = randomUUID();
        try {
          const hold = this.config.values.KOKORO_SYSTEM_RETENTION_HOLD;
          const reports = [
            await this.workspaces.maintain(hold),
            await this.products.maintain(hold),
            await this.sites.maintain(hold),
            await this.models.maintain(hold),
          ];
          const orphans = reports.reduce(
            (sum, report) => sum + report.orphans,
            0,
          );
          const purged =
            reports.reduce((sum, report) => sum + report.purged, 0) +
            (hold ? 0 : await this.receipts.purge());
          lifecycleLog({
            operation: "maintenance.reconcile",
            requestId,
            result: orphans ? "orphan_detected" : "success",
            count: orphans,
            durationMs: Date.now() - started,
          });
          lifecycleLog({
            operation: "maintenance.retention",
            requestId,
            result: hold ? "held" : "success",
            count: purged,
            durationMs: Date.now() - started,
          });
          return { orphans, purged };
        } catch (error) {
          lifecycleLog({
            operation: "maintenance.cycle",
            requestId,
            result: "error",
            durationMs: Date.now() - started,
          });
          throw error;
        } finally {
          clearTimeout(timer);
          this.pending = undefined;
          this.controller = undefined;
        }
      },
    );
    return this.pending;
  }
  public async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.controller?.abort(new Error("Maintenance draining"));
    await this.pending?.catch(() => undefined);
  }
}

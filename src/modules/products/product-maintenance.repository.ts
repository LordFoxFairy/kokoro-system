import type { DatabaseService } from "../../database/database.service.js";
import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../../database/transaction-context.js";
@Injectable()
export class ProductMaintenanceRepository {
  public async reconcile(tx: TransactionContext): Promise<number> {
    const apps = await tx.query(
      `SELECT a.id FROM system_application a WHERE a.deleted_at IS NULL AND (NOT EXISTS(SELECT 1 FROM system_site s WHERE s.id=a.site_id AND s.tenant_id=a.tenant_id AND s.deleted_at IS NULL) OR NOT EXISTS(SELECT 1 FROM system_product p WHERE p.id=a.product_id AND p.deleted_at IS NULL)) LIMIT 1000`,
    );
    const features = await tx.query(
      `SELECT f.id FROM system_feature_definition f WHERE NOT EXISTS(SELECT 1 FROM system_product p WHERE p.id=f.product_id) LIMIT 1000`,
    );
    const exposures = await tx.query(
      `SELECT e.id FROM system_app_feature_exposure e WHERE NOT EXISTS(SELECT 1 FROM system_application a JOIN system_feature_definition f ON f.product_id=a.product_id WHERE a.id=e.application_id AND a.tenant_id=e.tenant_id AND a.deleted_at IS NULL AND f.id=e.feature_id AND f.retired_at IS NULL) LIMIT 1000`,
    );
    const presentation = await tx.query(
      `SELECT p.id FROM system_presentation p WHERE NOT EXISTS(SELECT 1 FROM system_application a WHERE a.id=p.application_id AND a.tenant_id=p.tenant_id AND a.deleted_at IS NULL) LIMIT 1000`,
    );
    const configs = await tx.query(
      `SELECT c.id FROM system_config_record c WHERE c.deleted_at IS NULL AND ((c.product_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM system_product p WHERE p.id=c.product_id AND p.deleted_at IS NULL)) OR (c.site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM system_site s WHERE s.id=c.site_id AND s.tenant_id=c.tenant_id AND s.deleted_at IS NULL)) OR (c.release_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM system_config_release r WHERE r.id=c.release_id AND r.tenant_id=c.tenant_id))) LIMIT 1000`,
    );
    const bindings = await tx.query(
      `SELECT b.id FROM system_release_binding b WHERE b.status='active' AND (NOT EXISTS(SELECT 1 FROM system_config_release r WHERE r.id=b.release_id AND r.tenant_id=b.tenant_id AND r.status='published') OR NOT EXISTS(SELECT 1 FROM system_product p WHERE p.id=b.product_id AND p.deleted_at IS NULL) OR (b.site_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM system_site s WHERE s.id=b.site_id AND s.tenant_id=b.tenant_id AND s.deleted_at IS NULL))) LIMIT 1000`,
    );
    return (
      apps.rows.length +
      features.rows.length +
      exposures.rows.length +
      presentation.rows.length +
      configs.rows.length +
      bindings.rows.length
    );
  }
  public async purge(database: DatabaseService): Promise<number> {
    let count = 0;
    const configs = await database.read(
      async (tx) =>
        await tx.query<{
          id: string;
          site_id: string | null;
          product_id: string | null;
        }>(
          `SELECT id,site_id,product_id FROM system_config_record WHERE release_id IS NULL AND deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY site_id,product_id,id LIMIT 1000`,
        ),
    );
    for (const row of configs.rows) {
      await database.transaction(async (tx) => {
        if (row.site_id)
          await tx.query("SELECT id FROM system_site WHERE id=$1 FOR UPDATE", [
            row.site_id,
          ]);
        if (row.product_id)
          await tx.query(
            "SELECT id FROM system_product WHERE id=$1 FOR UPDATE",
            [row.product_id],
          );
        count +=
          (
            await tx.query(
              "DELETE FROM system_config_record WHERE id=$1 AND release_id IS NULL AND deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days'",
              [row.id],
            )
          ).rowCount ?? 0;
      });
    }
    const bindings = await database.read(
      async (tx) =>
        await tx.query<{
          id: string;
          site_id: string | null;
          product_id: string;
          release_id: string;
        }>(
          `SELECT id,site_id,product_id,release_id FROM system_release_binding WHERE status='archived' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY site_id,product_id,release_id,id LIMIT 1000`,
        ),
    );
    for (const row of bindings.rows) {
      await database.transaction(async (tx) => {
        if (row.site_id)
          await tx.query("SELECT id FROM system_site WHERE id=$1 FOR UPDATE", [
            row.site_id,
          ]);
        await tx.query("SELECT id FROM system_product WHERE id=$1 FOR UPDATE", [
          row.product_id,
        ]);
        await tx.query(
          "SELECT id FROM system_config_release WHERE id=$1 FOR UPDATE",
          [row.release_id],
        );
        count +=
          (
            await tx.query(
              "DELETE FROM system_release_binding WHERE id=$1 AND status='archived' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '30 days'",
              [row.id],
            )
          ).rowCount ?? 0;
      });
    }
    const apps = await database.read(
      async (tx) =>
        await tx.query<{
          id: string;
          site_id: string;
          product_id: string;
        }>(
          `SELECT id,site_id,product_id FROM system_application WHERE deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' ORDER BY site_id,product_id,id LIMIT 1000`,
        ),
    );
    for (const row of apps.rows) {
      await database.transaction(async (tx) => {
        await tx.query("SELECT id FROM system_site WHERE id=$1 FOR UPDATE", [
          row.site_id,
        ]);
        await tx.query("SELECT id FROM system_product WHERE id=$1 FOR UPDATE", [
          row.product_id,
        ]);
        const locked = await tx.query(
          "SELECT id FROM system_application WHERE id=$1 AND deleted_at<CURRENT_TIMESTAMP-INTERVAL '30 days' FOR UPDATE SKIP LOCKED",
          [row.id],
        );
        if (!locked.rows.length) return;
        await tx.query(
          "DELETE FROM system_app_feature_exposure WHERE application_id=$1",
          [row.id],
        );
        await tx.query(
          "DELETE FROM system_presentation WHERE application_id=$1",
          [row.id],
        );
        count +=
          (
            await tx.query("DELETE FROM system_application WHERE id=$1", [
              row.id,
            ])
          ).rowCount ?? 0;
      });
    }
    const releases = await database.read(
      async (tx) =>
        await tx.query<{ id: string }>(
          `SELECT id FROM system_config_release WHERE status='retired' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '90 days' ORDER BY id LIMIT 1000`,
        ),
    );
    for (const row of releases.rows) {
      await database.transaction(async (tx) => {
        if (
          !(
            await tx.query(
              "SELECT id FROM system_config_release WHERE id=$1 AND status='retired' AND updated_at<CURRENT_TIMESTAMP-INTERVAL '90 days' FOR UPDATE SKIP LOCKED",
              [row.id],
            )
          ).rows.length
        )
          return;

        if (
          (
            await tx.query(
              "SELECT 1 FROM system_release_binding WHERE release_id=$1 LIMIT 1",
              [row.id],
            )
          ).rows.length
        )
          return;
        await tx.query("DELETE FROM system_config_record WHERE release_id=$1", [
          row.id,
        ]);
        count +=
          (
            await tx.query("DELETE FROM system_config_release WHERE id=$1", [
              row.id,
            ])
          ).rowCount ?? 0;
      });
    }
    return count;
  }
}

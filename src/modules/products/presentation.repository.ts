import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import { SystemError } from "../../system.error.js";
import { presentationSchema } from "./schemas/presentation.schema.js";
import type { presentationInputSchema } from "./schemas/presentation.schema.js";
const columns =
  "id,tenant_id,application_id,locale,surface_id,schema_version,navigation,theme,locale_namespaces,version,created_at,updated_at";
@Injectable()
export class PresentationRepository {
  public async find(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    locale: string,
    surface: string | null,
    lock = false,
  ) {
    const result = await tx.query(
      `SELECT ${columns} FROM system_presentation WHERE tenant_id=$1 AND application_id=$2 AND locale=$3 AND surface_id IS NOT DISTINCT FROM $4 ${lock ? "FOR UPDATE" : ""}`,
      [tenant, appId, locale, surface],
    );
    return result.rows[0]
      ? decodeRow(presentationSchema, result.rows[0])
      : null;
  }
  public async validateNavigation(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    keys: string[],
  ) {
    const unique = [...new Set(keys)];
    if (!unique.length) return;
    const result = await tx.query<{ id: string }>(
      "SELECT f.id FROM system_feature_definition f JOIN system_app_feature_exposure e ON e.feature_id=f.id WHERE e.tenant_id=$1 AND e.application_id=$2 AND e.enabled AND f.retired_at IS NULL AND f.global_feature_key=ANY($3::text[]) ORDER BY f.id FOR UPDATE OF f",
      [tenant, appId, unique],
    );
    if (result.rows.length !== unique.length)
      throw new SystemError(
        "INVALID_ARGUMENT",
        "Navigation feature is not exposed",
      );
  }
  public async put(
    tx: TransactionContext,
    tenant: string,
    appId: string,
    locale: string,
    surface: string | null,
    input: z.infer<typeof presentationInputSchema>,
  ) {
    const result = await tx
      .query(
        `INSERT INTO system_presentation(id,tenant_id,application_id,locale,surface_id,schema_version,navigation,theme,locale_namespaces) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(tenant_id,application_id,locale,(COALESCE(surface_id,''))) DO UPDATE SET navigation=EXCLUDED.navigation,theme=EXCLUDED.theme,locale_namespaces=EXCLUDED.locale_namespaces,version=system_presentation.version+1,updated_at=CURRENT_TIMESTAMP(3) RETURNING ${columns}`,
        [
          randomUUID(),
          tenant,
          appId,
          locale,
          surface,
          input.schema_version,
          JSON.stringify(input.navigation),
          JSON.stringify(input.theme),
          JSON.stringify(input.locale_namespaces),
        ],
      )
      .catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23514" &&
          "constraint" in error &&
          error.constraint === "ck_system_presentation_schema"
        )
          throw new SystemError(
            "INVALID_ARGUMENT",
            "Input exceeds stored representation limits",
          );
        throw error;
      });
    return decodeRow(presentationSchema, result.rows[0]!);
  }
}

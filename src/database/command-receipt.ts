import { SystemConfig } from "../config/system-config.js";
import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { RequestContext } from "../access/request-context.js";
import { SystemError } from "../system.error.js";
import { DatabaseService } from "./database.service.js";
import type { TransactionContext } from "./transaction-context.js";
import { commandDigest } from "./command-digest.js";
@Injectable()
export class CommandReceipt {
  public constructor(
    @Inject(SystemConfig) private readonly config: SystemConfig,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  public async run<T>(
    context: RequestContext,
    body: unknown,
    schema: z.ZodType<T>,
    execute: (transaction: TransactionContext) => Promise<T>,
  ): Promise<T> {
    if (!context.idempotencyKey)
      throw new SystemError("INVALID_ARGUMENT", "Idempotency-Key required");
    const key = context.idempotencyKey;
    const scopeId = context.scope === "global" ? "" : context.tenantId;
    if (scopeId === null) throw new SystemError("FORBIDDEN", "Tenant required");
    const digest = commandDigest({
      operation: context.operation,
      actor: context.actorId,
      path: context.path,
      body,
      precondition: context.precondition,
    });
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.database.transaction(async (transaction) => {
          await transaction.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [JSON.stringify([context.scope, scopeId, key])],
          );
          const prior = await transaction.query<{
            request_hash: string;
            response_json: unknown;
          }>(
            "SELECT request_hash,response_json FROM system_command_receipt WHERE scope_kind=$1 AND scope_id=$2 AND idempotency_key=$3 AND status='completed' AND expires_at>CURRENT_TIMESTAMP(3)",
            [context.scope, scopeId, key],
          );
          if (prior.rows[0]) {
            if (prior.rows[0].request_hash !== digest)
              throw new SystemError(
                "IDEMPOTENCY_KEY_REUSED",
                "Idempotency key reused",
              );
            return schema.parse(prior.rows[0].response_json);
          }
          if (this.config.values.KOKORO_SYSTEM_RETENTION_HOLD) {
            const held = await transaction.query(
              "SELECT id FROM system_command_receipt WHERE scope_kind=$1 AND scope_id=$2 AND idempotency_key=$3",
              [context.scope, scopeId, key],
            );
            if (held.rows.length)
              throw new SystemError(
                "IDEMPOTENCY_KEY_REUSED",
                "Expired key retained under hold",
              );
          }
          await transaction.query(
            "DELETE FROM system_command_receipt WHERE scope_kind=$1 AND scope_id=$2 AND idempotency_key=$3 AND expires_at<=CURRENT_TIMESTAMP(3)",
            [context.scope, scopeId, key],
          );
          if (context.scope === "tenant") {
            await transaction.query(
              "INSERT INTO system_runtime_manifest_generation (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING",
              [scopeId],
            );
            await transaction.query(
              "SELECT generation FROM system_runtime_manifest_generation WHERE tenant_id=$1 FOR UPDATE",
              [scopeId],
            );
          } else
            await transaction.query(
              "SELECT generation FROM system_catalog_generation WHERE scope='catalog' FOR UPDATE",
            );
          const result = schema.parse(await execute(transaction));
          if (context.scope === "tenant")
            await transaction.query(
              "UPDATE system_runtime_manifest_generation SET generation=generation+1,updated_at=CURRENT_TIMESTAMP(3) WHERE tenant_id=$1",
              [scopeId],
            );
          else
            await transaction.query(
              "UPDATE system_catalog_generation SET generation=generation+1,updated_at=CURRENT_TIMESTAMP(3) WHERE scope='catalog'",
            );
          await transaction.query(
            "INSERT INTO system_command_receipt (id,scope_kind,scope_id,idempotency_key,request_hash,status,response_json,completed_at) VALUES ($1,$2,$3,$4,$5,'completed',$6,CURRENT_TIMESTAMP(3))",
            [
              randomUUID(),
              context.scope,
              scopeId,
              key,
              digest,
              JSON.stringify(result),
            ],
          );
          return result;
        });
      } catch (error) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? error.code
            : null;
        if ((code === "40001" || code === "40P01") && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              20 * 2 ** attempt + Math.floor(Math.random() * 20),
            ),
          );
          continue;
        }
        throw error;
      }
    }
  }
}

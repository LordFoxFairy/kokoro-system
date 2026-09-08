import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../http/pagination.js";
import { OwnerError } from "../../http/owner-error.js";
import { commandDigest } from "../../database/command-digest.js";
import { revisionSchema } from "./schemas/revision.schema.js";
import type { revisionInputSchema } from "./schemas/revision.schema.js";
const columns =
  "id,model_id,provider_id,revision,provider_model_name,display_name,feature_key,input_modalities,output_modalities,transport,gateway_model_name,context_window,priority,digest,version,published_at,retired_at,created_at,updated_at";
@Injectable()
export class RevisionRepository {
  public async find(tx: TransactionContext, id: string, lock = false) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_revision WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new OwnerError("NOT_FOUND", "Revision not found", 404);
    return decodeRow(revisionSchema, result.rows[0]);
  }
  public async list(tx: TransactionContext, query: PageQuery) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_revision WHERE ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT $3`,
      [
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
      ],
    );
    return result.rows.map((row) => decodeRow(revisionSchema, row));
  }
  public async create(
    tx: TransactionContext,
    input: z.infer<typeof revisionInputSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO model_revision(id,model_id,provider_id,revision,provider_model_name,display_name,feature_key,input_modalities,output_modalities,transport,gateway_model_name,context_window,priority,digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING ${columns}`,
      [
        randomUUID(),
        input.model_id,
        input.provider_id,
        input.revision,
        input.provider_model_name,
        input.display_name,
        input.feature_key,
        JSON.stringify(input.input_modalities),
        JSON.stringify(input.output_modalities),
        input.transport,
        input.gateway_model_name,
        input.context_window,
        input.priority,
        commandDigest(input),
      ],
    );
    return decodeRow(revisionSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    id: string,
    input: z.infer<typeof revisionInputSchema>,
  ) {
    const result = await tx.query(
      `UPDATE model_revision SET provider_id=$2,provider_model_name=$3,display_name=$4,feature_key=$5,input_modalities=$6,output_modalities=$7,transport=$8,gateway_model_name=$9,context_window=$10,priority=$11,digest=$12,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [
        id,
        input.provider_id,
        input.provider_model_name,
        input.display_name,
        input.feature_key,
        JSON.stringify(input.input_modalities),
        JSON.stringify(input.output_modalities),
        input.transport,
        input.gateway_model_name,
        input.context_window,
        input.priority,
        commandDigest(input),
      ],
    );
    return decodeRow(revisionSchema, result.rows[0]!);
  }
  public async publish(tx: TransactionContext, id: string) {
    const result = await tx.query(
      `UPDATE model_revision SET published_at=CURRENT_TIMESTAMP(3),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id],
    );
    return decodeRow(revisionSchema, result.rows[0]!);
  }
  public async retire(tx: TransactionContext, id: string) {
    const result = await tx.query<{ used: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM model_label WHERE default_revision_id=$1 AND deleted_at IS NULL) OR EXISTS(SELECT 1 FROM model_routing_policy WHERE model_revision_id=$1) AS used",
      [id],
    );
    if (result.rows[0]?.used)
      throw new OwnerError(
        "RESOURCE_IN_USE",
        "Revision has routing references",
        409,
      );
    const updated = await tx.query(
      `UPDATE model_revision SET retired_at=CURRENT_TIMESTAMP(3),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id],
    );
    return decodeRow(revisionSchema, updated.rows[0]!);
  }
}

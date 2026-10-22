import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { z } from "zod";
import type { TransactionContext } from "../../database/transaction-context.js";
import { decodeRow } from "../../database/row-decoder.js";
import type { PageQuery } from "../../database/page-query.js";
import { SystemError } from "../../system.error.js";
import { commandDigest } from "../../database/command-digest.js";
import { revisionSchema } from "./schemas/revision.schema.js";
import type { revisionContentSchema } from "./schemas/revision.schema.js";
const columns =
  "id,model_id,provider_id,revision,provider_model_name,display_name,input_modalities,output_modalities,request_model,context_window,max_output_tokens,priority,digest,version,published_at,retired_at,created_at,updated_at,jsonb_build_object('protocol',connection_protocol,'connection_type',connection_type,'base_url',connection_base_url,'secret_handle_ref',connection_secret_handle_ref) AS connection";
@Injectable()
export class RevisionRepository {
  public async find(tx: TransactionContext, id: string, lock = false) {
    const result = await tx.query(
      `SELECT ${columns} FROM model_revision WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    if (!result.rows[0])
      throw new SystemError("NOT_FOUND", "Revision not found");
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
    input: z.infer<typeof revisionContentSchema>,
  ) {
    const result = await tx.query(
      `INSERT INTO model_revision(id,model_id,provider_id,revision,provider_model_name,display_name,input_modalities,output_modalities,request_model,context_window,max_output_tokens,priority,digest,connection_protocol,connection_type,connection_base_url,connection_secret_handle_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING ${columns}`,
      [
        randomUUID(),
        input.model_id,
        input.provider_id,
        input.revision,
        input.provider_model_name,
        input.display_name,
        JSON.stringify(input.input_modalities),
        JSON.stringify(input.output_modalities),
        input.request_model,
        input.context_window,
        input.max_output_tokens,
        input.priority,
        commandDigest(input),
        input.connection.protocol,
        input.connection.connection_type,
        input.connection.base_url,
        input.connection.secret_handle_ref,
      ],
    );
    return decodeRow(revisionSchema, result.rows[0]!);
  }
  public async update(
    tx: TransactionContext,
    id: string,
    input: z.infer<typeof revisionContentSchema>,
  ) {
    const result = await tx.query(
      `UPDATE model_revision SET provider_id=$2,provider_model_name=$3,display_name=$4,input_modalities=$5,output_modalities=$6,request_model=$7,context_window=$8,max_output_tokens=$9,priority=$10,digest=$11,connection_protocol=$12,connection_type=$13,connection_base_url=$14,connection_secret_handle_ref=$15,version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [
        id,
        input.provider_id,
        input.provider_model_name,
        input.display_name,
        JSON.stringify(input.input_modalities),
        JSON.stringify(input.output_modalities),
        input.request_model,
        input.context_window,
        input.max_output_tokens,
        input.priority,
        commandDigest(input),
        input.connection.protocol,
        input.connection.connection_type,
        input.connection.base_url,
        input.connection.secret_handle_ref,
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
      throw new SystemError(
        "RESOURCE_IN_USE",
        "Revision has routing references",
      );
    const updated = await tx.query(
      `UPDATE model_revision SET retired_at=CURRENT_TIMESTAMP(3),version=version+1,updated_at=CURRENT_TIMESTAMP(3) WHERE id=$1 RETURNING ${columns}`,
      [id],
    );
    return decodeRow(revisionSchema, updated.rows[0]!);
  }
}

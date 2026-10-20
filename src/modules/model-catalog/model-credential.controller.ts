import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import type { z } from "zod";
import { Access } from "../../access/access.decorator.js";
import { Context } from "../../access/request-context.decorator.js";
import type { RequestContext } from "../../access/request-context.js";
import { ModelCredentialService } from "./model-credential.service.js";
import {
  credentialReadInputSchema,
  providerCreationQuerySchema,
} from "./schemas/credential.schema.js";
@Controller("v1/system/model-catalog")
export class ModelCredentialController {
  public constructor(
    @Inject(ModelCredentialService)
    private readonly credentials: ModelCredentialService,
  ) {}
  @Get("provider-creations")
  @Header("Cache-Control", "no-store")
  @Access({
    operation: "getModelProviderCreation",
    scope: "global",
    permission: "system:write",
  })
  public creation(
    @Context() context: RequestContext,
    @Query({ schema: providerCreationQuerySchema })
    input: z.infer<typeof providerCreationQuerySchema>,
  ) {
    return this.credentials.creation(context, input.idempotency_key);
  }
  @Post("credentials/read")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @Access({
    operation: "readModelCredential",
    permission: "service-context",
    mutation: false,
  })
  public read(
    @Context() context: RequestContext,
    @Body({ schema: credentialReadInputSchema })
    input: z.infer<typeof credentialReadInputSchema>,
  ) {
    return this.credentials.read(context, input);
  }
}

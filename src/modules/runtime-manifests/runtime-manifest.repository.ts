import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
@Injectable()
export class RuntimeManifestRepository {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  public generations(tenant: string) {
    return this.database.read(async (tx) => {
      const result = await tx.query<{
        generation: string;
        catalog_generation: string;
      }>(
        "SELECT COALESCE((SELECT generation FROM system_runtime_manifest_generation WHERE tenant_id=$1),1)::text AS generation,(SELECT generation::text FROM system_catalog_generation WHERE scope='catalog') AS catalog_generation",
        [tenant],
      );
      return result.rows[0]!;
    });
  }
}

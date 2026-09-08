import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { Client } from "pg";

const administratorUrl = process.env.TEST_ADMIN_DATABASE_URL;
if (!administratorUrl)
  throw new Error("TEST_ADMIN_DATABASE_URL is required; no integration skip");
const databaseName = `system_g1_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: administratorUrl });
const databaseUrl = new URL(administratorUrl);
databaseUrl.pathname = `/${databaseName}`;
const database = new Client({ connectionString: databaseUrl.href });
let created = false;
let connected = false;
let assertions = 0;
async function rejected(
  sql: string,
  values: unknown[],
  code: string,
): Promise<void> {
  try {
    await database.query(sql, values);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    ) {
      assertions++;
      return;
    }
    throw error;
  }
  throw new Error(`SQL invariant did not reject with ${code}`);
}
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  created = true;
  const env = { ...process.env, DATABASE_URL: databaseUrl.href };
  execFileSync("pnpm", ["db:apply-schema"], { env, stdio: "pipe" });
  assertions++;
  const repeat = spawnSync("pnpm", ["db:apply-schema"], {
    env,
    encoding: "utf8",
  });
  if (
    repeat.status === 0 ||
    !repeat.stderr.includes("requires a blank database")
  )
    throw new Error("Nonempty database was not rejected");
  assertions++;
  await database.connect();
  connected = true;
  await database.query("SET search_path TO public, pg_catalog");
  await database.query("SET TIME ZONE 'UTC'");
  const tables = await database.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
  );
  if (tables.rows[0]?.count !== "22")
    throw new Error(`Unexpected target table count: ${tables.rows[0]?.count}`);
  assertions++;
  const receipt =
    "INSERT INTO system_command_receipt (id,scope_kind,scope_id,idempotency_key,request_hash,status) VALUES ($1,$2,$3,$4,$5,'pending')";
  await database.query(receipt, [
    randomUUID(),
    "global",
    "",
    "same",
    "a".repeat(64),
  ]);
  await database.query(receipt, [
    randomUUID(),
    "tenant",
    "global",
    "same",
    "a".repeat(64),
  ]);
  assertions++;
  await rejected(
    receipt,
    [randomUUID(), "global", "tenant-forgery", "same", "a".repeat(64)],
    "23514",
  );
  await rejected(
    receipt,
    [randomUUID(), "tenant", "", "same", "a".repeat(64)],
    "23514",
  );
  await rejected(
    receipt,
    [randomUUID(), "global", "", "same", "a".repeat(64)],
    "23505",
  );
  const config =
    "INSERT INTO system_config_record (id,tenant_id,site_id,module_key,scope_type,scope_id,product_id,locale,config_key,schema_version,value_json,status,digest) VALUES ($1,$2,$3,'theme',$4,$5,$6,NULL,'theme',1,'{}','active',$7)";
  const product = randomUUID();
  await database.query(config, [
    randomUUID(),
    null,
    null,
    "global",
    null,
    null,
    "a".repeat(64),
  ]);
  assertions++;
  await rejected(
    config,
    [randomUUID(), null, null, "global", null, null, "a".repeat(64)],
    "23505",
  );
  await rejected(
    config,
    [randomUUID(), "t", null, "tenant", null, null, "a".repeat(64)],
    "23514",
  );
  await rejected(
    config,
    [randomUUID(), "t", null, "tenant", "other", null, "a".repeat(64)],
    "23514",
  );
  await rejected(
    config,
    [randomUUID(), "t", null, "product", randomUUID(), product, "a".repeat(64)],
    "23514",
  );
  await rejected(
    config,
    [randomUUID(), "t", null, "surface", "web", product, "a".repeat(64)],
    "23514",
  );
  await rejected(
    "INSERT INTO system_config_release (id,tenant_id,release_key,status,digest) VALUES ($1,NULL,'global','draft',$2)",
    [randomUUID(), "a".repeat(64)],
    "23502",
  );
  await rejected(
    "UPDATE system_config_record SET release_id=$1 WHERE scope_type='global'",
    [randomUUID()],
    "23514",
  );
  const routing =
    "INSERT INTO model_routing_policy (id,tenant_id,label_id,feature_key,visible,is_default) VALUES ($1,'t',$2,'chat',true,true)";
  await database.query(routing, [randomUUID(), randomUUID()]);
  await rejected(routing, [randomUUID(), randomUUID()], "23505");
  const revision = randomUUID();
  await database.query(
    "INSERT INTO model_revision (id,model_id,provider_id,revision,provider_model_name,display_name,feature_key,input_modalities,output_modalities,transport,gateway_model_name,digest,published_at) VALUES ($1,$2,$3,1,'model','Model','chat','[\"text\"]','[\"text\"]','litellm','gateway',$4,CURRENT_TIMESTAMP(3))",
    [revision, randomUUID(), randomUUID(), "a".repeat(64)],
  );
  await rejected(
    "UPDATE model_revision SET digest=$1 WHERE id=$2",
    ["b".repeat(64), revision],
    "23514",
  );
  await rejected(
    "UPDATE model_revision SET published_at=NULL WHERE id=$1",
    [revision],
    "23514",
  );
  await rejected("DELETE FROM model_revision WHERE id=$1", [revision], "23514");
  await database.query(
    "UPDATE model_revision SET retired_at=CURRENT_TIMESTAMP(3), version=version+1 WHERE id=$1",
    [revision],
  );
  assertions++;
  await rejected(
    "UPDATE model_revision SET retired_at=NULL WHERE id=$1",
    [revision],
    "23514",
  );
  const feature = randomUUID();
  await database.query(
    "INSERT INTO system_feature_definition (id,product_id,global_feature_key,display_name,result_contract) VALUES ($1,$2,'chat','Chat','{}')",
    [feature, product],
  );
  await rejected(
    "UPDATE system_feature_definition SET global_feature_key='other' WHERE id=$1",
    [feature],
    "23514",
  );
  await rejected(
    "DELETE FROM system_feature_definition WHERE id=$1",
    [feature],
    "23514",
  );
  console.log(
    `Fresh PostgreSQL schema verified: ${assertions} assertions, 22 tables; isolated ${databaseName}; business HTTP not tested`,
  );
} finally {
  if (connected) await database.end();
  if (created)
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await admin.end();
}

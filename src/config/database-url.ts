// Pure startup configuration: never reads environment, opens resources or runs DDL.
export function parseSystemDatabaseUrl(raw: string | undefined): Readonly<{
  connectionString: string;
  schema: string;
  options: string;
}> {
  if (
    !raw ||
    [...raw].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  )
    throw new Error(
      "DATABASE_URL requires a PostgreSQL URL without raw control characters",
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL requires a valid PostgreSQL URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    throw new Error("DATABASE_URL requires the PostgreSQL protocol");
  const schemas = url.searchParams.getAll("schema");
  const schema = schemas[0];
  if (
    schemas.length !== 1 ||
    !schema ||
    !/^[a-z][a-z0-9_]{0,62}$/u.test(schema) ||
    schema === "public" ||
    schema.startsWith("pg_")
  )
    throw new Error(
      "DATABASE_URL requires exactly one explicit non-reserved owner schema",
    );
  // pg merges parsed query parameters over Client/Pool settings. Allow transport
  // parameters, never application-owned options, stream, timeouts or pool knobs.
  const transportParameters = new Set([
    "schema",
    "application_name",
    "fallback_application_name",
    "client_encoding",
    "connect_timeout",
    "ssl",
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
    "keepalives",
    "keepalives_idle",
    "keepalives_interval",
    "keepalives_count",
    "host",
    "port",
    "database",
    "user",
    "password",
  ]);
  for (const key of url.searchParams.keys())
    if (!transportParameters.has(key))
      throw new Error(
        "DATABASE_URL contains an unsupported or application-owned connection parameter",
      );
  url.searchParams.delete("schema");
  return Object.freeze({
    connectionString: url.href,
    schema,
    options: `-c timezone=UTC -c search_path=${schema},pg_catalog -c lock_timeout=3000`,
  });
}

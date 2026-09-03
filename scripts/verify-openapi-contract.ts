import { readFile } from "node:fs/promises";

const path = new URL("../contract/openapi/system.openapi.json", import.meta.url);
const source = await readFile(path, "utf8");
const value: unknown = JSON.parse(source);

function record(
  input: unknown,
  message: string,
): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error(message);
  return Object.fromEntries(Object.entries(input));
}

const document = record(value, "OpenAPI contract must be an object");
if (document.openapi !== "3.1.0")
  throw new Error("OpenAPI contract must use version 3.1.0");
const paths = Object.keys(
  record(document.paths, "OpenAPI contract paths are required"),
);
if (
  paths.some(
    (entry) => entry.startsWith("/system/") || entry.startsWith("/rpc/"),
  )
)
  throw new Error("OpenAPI contract contains a legacy or pseudo-RPC path");
if (!paths.includes("/v1/system/runtime-manifest"))
  throw new Error("OpenAPI contract is missing runtime manifest");

process.stdout.write(`verified OpenAPI contract (${String(paths.length)} paths)\n`);

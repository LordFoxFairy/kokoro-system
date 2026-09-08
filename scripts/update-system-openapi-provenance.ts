import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(join(directory, entry.name))
        : entry.name.endsWith(".schema.ts")
          ? [join(directory, entry.name)]
          : [],
    )
    .sort();
}
const sources = [
  ...sourceFiles("src/modules"),
  "src/http/protocol.schema.ts",
  "scripts/generate-system-openapi.ts",
  "scripts/system-openapi-operations.ts",
].sort();
const digest = (path: string): string =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const parsed: unknown = JSON.parse(
  readFileSync("contract/provenance.json", "utf8"),
);
const provenance = z.record(z.string(), z.unknown()).parse(parsed);
provenance.openapi = {
  file: "openapi/system.openapi.json",
  sha256: digest("contract/openapi/system.openapi.json"),
  source: "runtime-zod",
  sourceSha256: Object.fromEntries(sources.map((path) => [path, digest(path)])),
};
provenance.releaseClassification = {
  contractVersion: "2.0.0",
  httpRouteGeneration: "v1",
  baseline: "none-unpublished",
  classification: "v1-fresh-cutover",
  change: "complete-system-http-zod-envelope-cas-model-owner",
  publishedCompatibilityRequired: false,
};
provenance.consumers = [
  {
    consumer: "kokoro-bff",
    surface: "runtime-manifest/model-catalog",
    disposition: "pending-owner-cutover-and-live-verification",
  },
  {
    consumer: "kokoro-agent",
    surface: "model-catalog/resolve",
    disposition: "pending-executable-route-wiring-and-live-verification",
  },
  {
    consumer: "control-plane-service-callers",
    surface: "system-control-http",
    disposition: "generate-from-final-v1-before-first-release",
  },
  {
    consumer: "site-service-callers",
    surface: "kokoro.site.v1",
    disposition: "legacy-owner-tests-only-pending-removal",
  },
];
const expected = `${JSON.stringify(provenance, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync("contract/provenance.json", "utf8") !== expected)
    throw new Error("Runtime Zod/OpenAPI provenance drift");
  console.log(`Runtime Zod provenance verified: ${sources.length} sources`);
} else writeFileSync("contract/provenance.json", expected);

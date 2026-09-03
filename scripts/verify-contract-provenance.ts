import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function invalid(name: string): Error {
  return new Error(`contract provenance ${name} is invalid`);
}

function record(
  value: unknown,
  name: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalid(name);
  return Object.fromEntries(Object.entries(value));
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw invalid(name);
  return value;
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw invalid(name);
  return value.map((entry) => stringValue(entry, name));
}

const parsed: unknown = JSON.parse(
  readFileSync(new URL("../contract/provenance.json", import.meta.url), "utf8"),
);
const input = record(parsed, "document");
const provenance = {
  source: stringValue(input.source, "source"),
  files: stringArray(input.files, "files"),
  protoSha256: record(input.protoSha256, "protoSha256"),
  combinedSha256: stringValue(input.combinedSha256, "combinedSha256"),
};

if (provenance.source !== "contract/proto") {
  throw new Error("contract provenance must point to local contract/proto");
}

const combined = createHash("sha256");
for (const file of provenance.files) {
  const content = readFileSync(new URL(`../contract/proto/${file}`, import.meta.url));
  const digest = createHash("sha256").update(content).digest("hex");
  const expectedDigest = stringValue(
    provenance.protoSha256[file],
    `protoSha256.${file}`,
  );
  if (digest !== expectedDigest) {
    throw new Error(`contract source drift: ${file}`);
  }
  combined.update(content);
}

if (combined.digest("hex") !== provenance.combinedSha256) {
  throw new Error("contract combined digest drift");
}

console.log("contract provenance verified: contract/proto");

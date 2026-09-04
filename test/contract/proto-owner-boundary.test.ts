import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const protoRoot = resolve(root, "contract/proto");
const generatedRoot = resolve(root, "src/generated/proto");

function posixRelative(base: string, path: string): string {
  return relative(base, path).split(sep).join("/");
}

async function files(directory: string, suffix: string): Promise<string[]> {
  const entries = await readdir(directory);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry);
    return (await stat(path)).isDirectory()
      ? files(path, suffix)
      : path.endsWith(suffix) ? [path] : [];
  }));
  return nested.flat().sort();
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function stringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new TypeError(`${name} must be a string array`);
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

async function generatedFromCanonicalSource(): Promise<Map<string, string>> {
  const cacheRoot = resolve(root, "node_modules/.cache");
  await mkdir(cacheRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(resolve(cacheRoot, "system-contract-"));
  const outputRoot = resolve(temporaryRoot, "generated");
  const templatePath = resolve(temporaryRoot, "buf.gen.yaml");
  const output = posixRelative(root, outputRoot);

  await writeFile(templatePath, [
    "version: v2",
    "clean: true",
    "plugins:",
    "  - local: protoc-gen-es",
    `    out: ${output}`,
    "    opt:",
    "      - target=ts",
    "      - import_extension=js",
    "",
  ].join("\n"));

  try {
    const generated = spawnSync(
      "pnpm",
      ["exec", "buf", "generate", "--template", templatePath, "contract"],
      { cwd: root, encoding: "utf8" },
    );
    if (generated.status !== 0) {
      throw new Error(`temporary contract generation failed:\n${generated.stdout}${generated.stderr}`);
    }

    const result = new Map<string, string>();
    for (const path of await files(outputRoot, ".ts")) {
      result.set(posixRelative(outputRoot, path), `${(await readFile(path, "utf8")).trimEnd()}\n`);
    }
    return result;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe("System protobuf owner boundary", () => {
  it("declares only the System-owned kokoro.site.v1 package", async () => {
    const sources = await files(protoRoot, ".proto");
    for (const path of sources) {
      const source = await readFile(path, "utf8");
      expect(source.match(/^package\s+([a-z0-9_.]+);$/mu)?.[1], posixRelative(protoRoot, path))
        .toBe("kokoro.site.v1");
      expect(source).not.toContain("kokoro.common.v1");
    }
  });

  it("tracks every canonical proto source and no foreign source in provenance", async () => {
    const sourcePaths = (await files(protoRoot, ".proto"))
      .map((path) => posixRelative(protoRoot, path));
    const parsed: unknown = JSON.parse(
      await readFile(resolve(root, "contract/provenance.json"), "utf8"),
    );
    const provenance = record(parsed, "provenance");
    const provenanceFiles = stringArray(provenance.files, "provenance.files");
    const digests = record(provenance.protoSha256, "provenance.protoSha256");

    expect(provenance.source).toBe("contract/proto");
    expect(provenanceFiles).toEqual(sourcePaths);
    expect(Object.keys(digests).sort()).toEqual(sourcePaths);

    const combined = createHash("sha256");
    for (const path of sourcePaths) {
      const content = await readFile(resolve(protoRoot, path));
      expect(stringValue(digests[path], `provenance.protoSha256.${path}`))
        .toBe(createHash("sha256").update(content).digest("hex"));
      combined.update(content);
    }
    expect(provenance.combinedSha256).toBe(combined.digest("hex"));
  });

  it("keeps checked-in generated bindings byte-identical to canonical generation", async () => {
    const expected = await generatedFromCanonicalSource();
    const checkedIn = new Map<string, string>();
    for (const path of await files(generatedRoot, ".ts")) {
      checkedIn.set(posixRelative(generatedRoot, path), await readFile(path, "utf8"));
    }

    expect([...checkedIn.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [path, content] of expected) {
      expect(checkedIn.get(path), path).toBe(content);
    }
  }, 30_000);

  it("runs the owner boundary gate from contract:check", async () => {
    const parsed: unknown = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
    const scripts = record(record(parsed, "package.json").scripts, "package.json.scripts");
    expect(scripts["test:contract-owner"]).toBe(
      "vitest run test/contract/proto-owner-boundary.test.ts",
    );
    expect(stringValue(scripts["contract:check"], "package.json.scripts.contract:check"))
      .toContain("pnpm test:contract-owner");
  });
});

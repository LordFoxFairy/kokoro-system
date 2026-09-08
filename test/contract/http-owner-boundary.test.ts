import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("publishes only System HTTP with no retired transport, SDK or global layers", () => {
  for (const path of [
    "src/application",
    "src/domain",
    "src/infrastructure",
    "src/interfaces",
    "src/bootstrap",
    "src/generated",
    "src/index.ts",
    "src/config/env.ts",
    "sdk",
    "contract/proto",
    "contract/buf.yaml",
    "contract/buf.gen.yaml",
  ])
    expect(existsSync(path), path).toBe(false);
  const manifest = readFileSync("package.json", "utf8");
  expect(manifest).not.toMatch(/bufbuild|connectrpc|sdk:|buf generate/);
  expect(
    z
      .object({ compilerOptions: z.object({ lib: z.array(z.string()) }) })
      .parse(JSON.parse(readFileSync("tsconfig.json", "utf8"))).compilerOptions
      .lib,
  ).toEqual(["ES2024"]);
  expect(readFileSync("src/main.ts", "utf8")).toContain("startSystem");
  const provenance: unknown = JSON.parse(
    readFileSync("contract/provenance.json", "utf8"),
  );
  expect(JSON.stringify(provenance)).not.toMatch(
    /kokoro\.site|protoSha|protobuf|bufbuild/,
  );
});

it("keeps both CI and release workflows on the real isolated owner gate", () => {
  for (const file of [
    ".github/workflows/ci.yml",
    ".github/workflows/release-image.yml",
  ]) {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("node-version: 24.13.0");
    expect(source).toContain("version: 12.3.4");
    expect(source).toContain("TEST_ADMIN_DATABASE_URL:");
    expect(source).toContain("scripts/system-runtime-smoke.ts --image");
    expect(source).not.toMatch(
      /test:runtime-real-system|production-image-smoke.sh|TEST_DATABASE_URL:/,
    );
  }
});

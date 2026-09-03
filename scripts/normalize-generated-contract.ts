import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const generatedRoot = path.resolve("src/generated/proto");

async function normalizeDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeDirectory(entryPath);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name) !== ".ts") {
      continue;
    }

    const generated = await readFile(entryPath, "utf8");
    const normalized = `${generated.trimEnd()}\n`;
    if (normalized !== generated) {
      await writeFile(entryPath, normalized, "utf8");
    }
  }
}

await normalizeDirectory(generatedRoot);

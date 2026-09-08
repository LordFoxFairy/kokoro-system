import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it } from "vitest";
import { stopOwnedProcessGroup } from "../../scripts/smoke-process.js";
import { runCleanup } from "../../scripts/smoke-cleanup.js";
it("reaps its owned group even after the launcher exited", async () => {
  const leader = spawn(
    process.execPath,
    [
      "-e",
      `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});child.unref();console.log(child.pid);setTimeout(()=>process.exit(0),50);`,
    ],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  let output = "";
  leader.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  await once(leader, "exit");
  const descendant = Number(output.trim());
  expect(leader.exitCode).toBe(0);
  expect(Number.isInteger(descendant)).toBe(true);
  try {
    expect(() => process.kill(descendant, 0)).not.toThrow();
    await stopOwnedProcessGroup(leader.pid!);
    expect(() => process.kill(descendant, 0)).toThrow();
  } finally {
    try {
      process.kill(-leader.pid!, "SIGKILL");
    } catch {
      /* Gone. */
    }
  }
}, 10000);
it("continues all resource cleanup and aggregates failures", async () => {
  const done: string[] = [];
  await expect(
    runCleanup([
      () => {
        throw new Error("process failed");
      },
      () => {
        done.push("drop");
        throw new Error("drop failed");
      },
      () => {
        done.push("close");
      },
    ]),
  ).rejects.toBeInstanceOf(AggregateError);
  expect(done).toEqual(["drop", "close"]);
});
it("promotes exactly the tested local image rather than rebuilding on a second runner", async () => {
  const { readFileSync } = await import("node:fs");
  const workflow = readFileSync(".github/workflows/release-image.yml", "utf8");
  expect(workflow).not.toContain("\n  publish:");
  expect(workflow).not.toContain("docker/build-push-action");
  expect(workflow.match(/docker build --tag/gu)).toHaveLength(1);
  expect(workflow).toContain('docker tag kokoro-system:release-smoke "$tag"');
  expect(workflow.indexOf("Smoke local production candidate")).toBeLessThan(
    workflow.indexOf("Promote tested production candidate"),
  );
  expect(workflow.indexOf("Scan production image")).toBeLessThan(
    workflow.indexOf("Promote tested production candidate"),
  );
});

it("refreshes runtime OS packages before installing dependencies without weakening the image scan", async () => {
  const { readFileSync } = await import("node:fs");
  const dockerfile = readFileSync("Dockerfile", "utf8");
  const runtime = dockerfile.split(/FROM[^\n]+ AS runtime\n/u)[1];
  expect(runtime).toBeDefined();
  const source = runtime ?? "";
  expect(source).toMatch(
    /RUN apt-get update\s*\\?\s*&& apt-get upgrade -y\s*\\?\s*&& rm -rf \/var\/lib\/apt\/lists\/\*/u,
  );
  expect(source.indexOf("RUN apt-get update")).toBeLessThan(
    source.indexOf("RUN npm install"),
  );
  expect(source.indexOf("apt-get upgrade -y")).toBeLessThan(
    source.indexOf("RUN pnpm install"),
  );
  const release = readFileSync(".github/workflows/release-image.yml", "utf8");
  expect(release).toMatch(/exit-code:\s*['"]?1/u);
  expect(release).not.toMatch(/trivyignores:|ignore-policy:|vex:/u);
});

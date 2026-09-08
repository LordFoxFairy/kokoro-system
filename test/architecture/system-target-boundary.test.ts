import "reflect-metadata";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { RequestMethod } from "@nestjs/common";
import { SitesController } from "../../src/modules/sites/sites.controller.js";
import { WorkspacesController } from "../../src/modules/workspaces/workspaces.controller.js";
import { ACCESS_RULE } from "../../src/access/access.decorator.js";
import type { AccessRule } from "../../src/access/access.decorator.js";
import { systemOperations } from "../../scripts/system-openapi-operations.js";
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}
describe("System target native Nest boundaries", () => {
  it("matches every Sites/Workspace native method/path/access rule against frozen owner contract", () => {
    const actual: string[] = [];
    for (const controller of [SitesController, WorkspacesController]) {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler: unknown = Reflect.get(controller.prototype, name);
        if (name === "constructor" || typeof handler !== "function") continue;
        const route = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        ) as RequestMethod;
        const rule = Reflect.getMetadata(ACCESS_RULE, handler) as AccessRule;
        const path =
          `/${[prefix, route].join("/").split("/").filter(Boolean).join("/")}`.replace(
            /:([a-z_]+)/gu,
            "{$1}",
          );
        const verb = RequestMethod[method].toLowerCase();
        actual.push(`${verb} ${path}`);
        const expected = systemOperations.find(
          (operation) => operation.path === path && operation.method === verb,
        );
        expect(expected).toBeDefined();
        expect(rule.operation).toBe(expected!.operationId);
        expect(rule.permission).toBe(expected!.permission);
        expect(rule.cas ?? "none").toBe(expected!.cas);
        expect(rule.scope ?? "tenant").toBe(expected!.scope);
      }
    }
    expect(actual.sort()).toEqual(
      systemOperations
        .filter((operation) =>
          ["sites", "workspaces"].includes(operation.module),
        )
        .map((operation) => `${operation.method} ${operation.path}`)
        .sort(),
    );
    expect(new Set(actual).size).toBe(17);
  });
  it("keeps SQL in owner repositories and forbids cross-module writes/deep imports", () => {
    const owners: Record<string, readonly string[]> = {
      sites: ["system_site", "system_site_host", "system_site_policy"],
      workspaces: ["system_workspace"],
    };
    for (const [module, tables] of Object.entries(owners)) {
      for (const file of files(`src/modules/${module}`)) {
        const source = readFileSync(file, "utf8");
        if (file.endsWith(".service.ts") || file.endsWith(".controller.ts"))
          expect(source).not.toMatch(
            /\b(?:SELECT |INSERT INTO |UPDATE system_|DELETE FROM )/u,
          );
        for (const match of source.matchAll(
          /\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(system_[a-z_]+|model_[a-z_]+)/gu,
        ))
          expect(tables).toContain(match[1]);
        expect(source).not.toMatch(
          /from ["'][^"']*\.\.\/[^"']*\.repository\.js["']/u,
        );
      }
    }
  });
});

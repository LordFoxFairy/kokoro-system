import { RuntimeManifestController } from "../../src/modules/runtime-manifests/runtime-manifest.controller.js";
import { BindingController } from "../../src/modules/products/binding.controller.js";
import { ReleaseController } from "../../src/modules/products/release.controller.js";
import { ConfigController } from "../../src/modules/products/config.controller.js";
import { PresentationController } from "../../src/modules/products/presentation.controller.js";
import { ExposureController } from "../../src/modules/products/exposure.controller.js";
import { FeatureController } from "../../src/modules/products/feature.controller.js";
import { ApplicationController } from "../../src/modules/products/application.controller.js";
import { ProductController } from "../../src/modules/products/product.controller.js";
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
  it("matches every G2/G3 native method/path/access rule against frozen owner contract", () => {
    const actual: string[] = [];
    for (const controller of [
      SitesController,
      WorkspacesController,
      ProductController,
      ApplicationController,
      FeatureController,
      ExposureController,
      PresentationController,
      ConfigController,
      ReleaseController,
      BindingController,
      RuntimeManifestController,
    ]) {
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
          ["sites", "workspaces", "products", "runtime-manifests"].includes(
            operation.module,
          ),
        )
        .map((operation) => `${operation.method} ${operation.path}`)
        .sort(),
    );
    expect(new Set(actual).size).toBe(53);
  });
  it("keeps SQL in owner repositories and forbids cross-module writes/deep imports", () => {
    const owners: Record<string, readonly string[]> = {
      sites: ["system_site", "system_site_host", "system_site_policy"],
      workspaces: ["system_workspace"],
      products: [
        "system_product",
        "system_application",
        "system_feature_definition",
        "system_app_feature_exposure",
        "system_presentation",
        "system_config_record",
        "system_config_release",
        "system_release_binding",
      ],
      "runtime-manifests": [],
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

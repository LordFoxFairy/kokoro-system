import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function violations(file: string, source: string): string[] {
  const errors: string[] = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const providerAliases = new Set<string>();
  for (const node of ast.statements) {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    )
      for (const item of node.importClause.namedBindings.elements)
        if (
          /(Service|Repository)$/u.test(
            item.propertyName?.text ?? item.name.text,
          )
        )
          providerAliases.add(item.name.text);
  }
  const feature = file.match(/^src\/modules\/([^/]+)\//u)?.[1];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const spec = node.moduleSpecifier.text;
      const target = spec.startsWith(".")
        ? posix.normalize(posix.join(posix.dirname(file), spec))
        : spec;
      const targetFeature = target.match(/^src\/modules\/([^/]+)\//u)?.[1];
      if (
        targetFeature &&
        targetFeature !== feature &&
        file !== "src/app.module.ts" &&
        !target.endsWith(`/${targetFeature}.public.js`)
      )
        errors.push("cross-feature-public");
      if (file.endsWith(".repository.ts") && target.startsWith("src/http/"))
        errors.push("repository-http");
      if (
        file.endsWith(".controller.ts") &&
        (/^(pg|redis|node:net|node:tls)(\/|$)/u.test(spec) ||
          target.startsWith("src/database/") ||
          target.startsWith("src/cache/"))
      )
        errors.push("controller-driver");
      if (
        file.startsWith("src/modules/") &&
        file.endsWith(".service.ts") &&
        /^(express|pg|redis|node:net|node:tls)(\/|$)/u.test(spec)
      )
        errors.push("service-transport-driver");
      if (
        ts.isExportDeclaration(node) &&
        file.endsWith(".public.ts") &&
        !node.exportClause
      )
        errors.push("wildcard-public");
      if (
        ts.isImportDeclaration(node) &&
        node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings)
      )
        for (const item of node.importClause.namedBindings.elements)
          if (
            ["forwardRef", "ModuleRef"].includes(
              item.propertyName?.text ?? item.name.text,
            )
          )
            errors.push("nest-indirection");
    }
    if (
      ts.isNewExpression(node) &&
      (/(Service|Repository)$/u.test(node.expression.getText(ast)) ||
        providerAliases.has(node.expression.getText(ast)))
    )
      errors.push("manual-provider");
    if (
      ts.isIdentifier(node) &&
      ["ModuleRef", "forwardRef"].includes(node.text)
    )
      errors.push("nest-indirection");
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "forwardRef"
    )
      errors.push("nest-indirection");
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return errors;
}
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : entry.name.endsWith(".ts")
        ? [join(directory, entry.name)]
        : [],
  );
}

describe("explicit System feature public API", () => {
  it("rejects deep imports, transport/driver leaks, wildcard exports and Nest escape hatches", () => {
    const cases = [
      [
        "src/modules/a/a.service.ts",
        'import { B } from "../b/b.service.js";',
        "cross-feature-public",
      ],
      [
        "src/maintenance/maintenance.service.ts",
        'import { B } from "../modules/b/b.service.js";',
        "cross-feature-public",
      ],
      [
        "src/modules/a/a.repository.ts",
        'import { E } from "../../http/error.js";',
        "repository-http",
      ],
      [
        "src/modules/a/a.controller.ts",
        'import { Pool } from "pg";',
        "controller-driver",
      ],
      [
        "src/modules/a/a.service.ts",
        'import type { Request } from "express";',
        "service-transport-driver",
      ],
      [
        "src/modules/a/a.public.ts",
        'export * from "./a.service.js";',
        "wildcard-public",
      ],
      [
        "src/modules/a/a.module.ts",
        'import { forwardRef as ref } from "@nestjs/common";',
        "nest-indirection",
      ],
      [
        "src/modules/a/a.service.ts",
        'import { ModuleRef } from "@nestjs/core";',
        "nest-indirection",
      ],
      ["src/modules/a/a.service.ts", "new OtherService();", "manual-provider"],
      [
        "src/modules/a/a.service.ts",
        'import { OtherService as Local } from "./other.service.js"; new Local();',
        "manual-provider",
      ],
      [
        "src/modules/a/a.service.ts",
        'import * as core from "@nestjs/core"; new core.ModuleRef();',
        "nest-indirection",
      ],
      [
        "src/modules/a/a.module.ts",
        'import * as nest from "@nestjs/common"; nest.forwardRef(() => A);',
        "nest-indirection",
      ],
      [
        "src/modules/a/a.controller.ts",
        'import { DatabaseService } from "../../database/database.service.js";',
        "controller-driver",
      ],
      [
        "src/modules/a/a.controller.ts",
        'import { CacheService } from "../../cache/cache.service.js";',
        "controller-driver",
      ],
      [
        "src/modules/a/a.service.ts",
        "new OtherRepository();",
        "manual-provider",
      ],
      [
        "src/modules/a/a.service.ts",
        'import { OtherRepository as Local } from "./other.repository.js"; new Local();',
        "manual-provider",
      ],
    ] as const;
    for (const [file, source, code] of cases)
      expect(violations(file, source)).toContain(code);
    expect(
      violations(
        "src/modules/a/a.service.ts",
        'import { B } from "../b/b.public.js";',
      ),
    ).toEqual([]);
    expect(
      violations(
        "src/modules/a/a.controller.ts",
        'import { AService } from "./a.service.js";',
      ),
    ).toEqual([]);
    expect(
      violations(
        "src/app.module.ts",
        'import { BModule } from "./modules/b/b.module.js";',
      ),
    ).toEqual([]);
    expect(
      violations(
        "src/database/database.service.ts",
        'import { Pool } from "pg";',
      ),
    ).toEqual([]);
  });
  it("enforces all production sources including the maintenance composition layer", () => {
    expect(
      files("src").flatMap((file) =>
        violations(file, readFileSync(file, "utf8")).map(
          (code) => `${file}: ${code}`,
        ),
      ),
    ).toEqual([]);
  });
  it("enables actual typed lint and all Promise/unsafe/exhaustive rules without suppression", () => {
    const config = readFileSync("eslint.config.js", "utf8");
    expect(config).toMatch(/recommendedTypeChecked|strictTypeChecked/u);
    expect(config).toMatch(/projectService:\s*true/u);
    for (const rule of [
      "no-floating-promises",
      "no-misused-promises",
      "no-unsafe-assignment",
      "no-unsafe-argument",
      "no-unsafe-call",
      "no-unsafe-member-access",
      "no-unsafe-return",
      "switch-exhaustiveness-check",
    ])
      expect(config).toContain(`@typescript-eslint/${rule}`);
    for (const file of files("src"))
      expect(readFileSync(file, "utf8"), file).not.toMatch(/eslint-disable/u);
  });
});

function cycles(sources: ReadonlyMap<string, string>): string[][] {
  const edges = new Map<string, string[]>();
  for (const [file, source] of sources) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    edges.set(
      file,
      ast.statements.flatMap((node) => {
        if (
          !(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ||
          !node.moduleSpecifier ||
          !ts.isStringLiteral(node.moduleSpecifier) ||
          !node.moduleSpecifier.text.startsWith(".")
        )
          return [];
        const target = posix
          .normalize(posix.join(posix.dirname(file), node.moduleSpecifier.text))
          .replace(/\.js$/u, ".ts");
        return sources.has(target) ? [target] : [];
      }),
    );
  }
  const done = new Set<string>();
  const found: string[][] = [];
  function visit(file: string, stack: string[]): void {
    const index = stack.indexOf(file);
    if (index !== -1) {
      found.push([...stack.slice(index), file]);
      return;
    }
    if (done.has(file)) return;
    for (const target of edges.get(file) ?? []) visit(target, [...stack, file]);
    done.add(file);
  }
  for (const file of sources.keys()) visit(file, []);
  return found;
}
it("rejects import/export cycles including type and public-barrel cycles", () => {
  expect(
    cycles(
      new Map([
        ["a.ts", 'export { B } from "./b.js";'],
        ["b.ts", 'import type { A } from "./a.js";'],
      ]),
    ),
  ).toHaveLength(1);
  expect(
    cycles(
      new Map([
        ["a.ts", 'import { B } from "./b.js";'],
        ["b.ts", "export class B {}"],
      ]),
    ),
  ).toEqual([]);
  expect(
    cycles(
      new Map(files("src").map((file) => [file, readFileSync(file, "utf8")])),
    ),
  ).toEqual([]);
});

function moduleList(source: string, key: "exports" | "imports"): string[] {
  const ast = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const values: string[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(ast) === key &&
      ts.isArrayLiteralExpression(node.initializer)
    )
      values.push(
        ...node.initializer.elements.map((value) => value.getText(ast)),
      );
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return values.sort();
}
it("keeps Nest exports to the exact consumer-backed providers and imports their modules", () => {
  const expected = {
    sites: ["SiteMaintenanceService", "SitesService"],
    products: ["ProductMaintenanceService", "ProductProjectionService"],
    workspaces: ["WorkspaceMaintenanceService"],
    "model-catalog": ["ModelMaintenanceService"],
  };
  for (const [feature, providers] of Object.entries(expected)) {
    const source = readFileSync(
      `src/modules/${feature}/${feature}.module.ts`,
      "utf8",
    );
    expect(moduleList(source, "exports"), feature).toEqual(providers);
    const publicSource = readFileSync(
      `src/modules/${feature}/${feature}.public.ts`,
      "utf8",
    );
    for (const provider of providers)
      expect(publicSource).toContain(`{ ${provider} }`);
  }
  expect(
    moduleList("@Module({ exports: [InternalService] })", "exports"),
  ).not.toEqual(expected.products);
  expect(
    moduleList(
      readFileSync(
        "src/modules/runtime-manifests/runtime-manifests.module.ts",
        "utf8",
      ),
      "imports",
    ),
  ).toEqual(["CacheModule", "DatabaseModule", "ProductsModule", "SitesModule"]);
  expect(
    moduleList(
      readFileSync("src/maintenance/maintenance.module.ts", "utf8"),
      "imports",
    ),
  ).toEqual([
    "DatabaseModule",
    "ModelCatalogModule",
    "ProductsModule",
    "SitesModule",
    "WorkspacesModule",
  ]);
  const source = readFileSync("src/start-system.ts", "utf8");
  expect(source).not.toMatch(/new\s+SystemConfig/u);
  expect(source).toContain("app.get(SystemConfig)");
});

it("actually runs typed Promise, unsafe and exhaustiveness rules on a negative fixture", async () => {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint();
  const results = await eslint.lintText(
    `
    const unsafe = JSON.parse("{}");
    unsafe.execute();
    function take(value: string) { return value; }
    take(unsafe);
    function leak() { return unsafe; }
    Promise.resolve("floating");
    setTimeout(async () => { await Promise.resolve(); }, 1);
    function incomplete(value: "a" | "b") { switch(value) { case "a": return 1; } }
    export { leak, incomplete };
  `,
    { filePath: "src/system.error.ts" },
  );
  const rules = results.flatMap((result) =>
    result.messages.map((message) => message.ruleId),
  );
  for (const rule of [
    "no-floating-promises",
    "no-misused-promises",
    "no-unsafe-assignment",
    "no-unsafe-argument",
    "no-unsafe-call",
    "no-unsafe-member-access",
    "no-unsafe-return",
    "switch-exhaustiveness-check",
  ])
    expect(rules).toContain(`@typescript-eslint/${rule}`);
  const positive = await eslint.lintText(
    `
    export function complete(value: "a" | "b"): number {
      switch(value) { case "a": return 1; case "b": return 2; }
    }
    export async function handled(): Promise<string> { return await Promise.resolve("ok"); }
  `,
    { filePath: "src/system.error.ts" },
  );
  expect(positive.flatMap((result) => result.messages)).toEqual([]);
}, 20000);

it("exports only named public symbols with exact cross-feature consumers", () => {
  const manifestService =
    "src/modules/runtime-manifests/runtime-manifest.service.ts";
  const maintenanceService = "src/maintenance/maintenance.service.ts";
  const expected: Record<string, string[]> = {
    SitesService: [manifestService],
    SiteMaintenanceService: [maintenanceService],
    ProductProjectionService: [manifestService],
    ProductMaintenanceService: [maintenanceService],
    WorkspaceMaintenanceService: [maintenanceService],
    ModelMaintenanceService: [maintenanceService],
  };
  const actual: Record<string, string[]> = {};
  for (const file of files("src")) {
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const statement of ast.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !statement.moduleSpecifier.text.endsWith(".public.js")
      )
        continue;
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      for (const item of bindings.elements) {
        const name = item.propertyName?.text ?? item.name.text;
        if (name.endsWith("Service")) (actual[name] ??= []).push(file);
      }
    }
  }
  expect(actual).toEqual(expected);
  const symbols: Record<string, string[]> = {
    sites: ["SitesModule", "SitesService", "SiteMaintenanceService"],
    products: [
      "ProductsModule",
      "ProductProjectionService",
      "ProductMaintenanceService",
      "navigationItemSchema",
      "themeSchema",
      "localeNamespaceSchema",
      "featureFlagSchema",
      "referenceSchema",
    ],
    workspaces: ["WorkspacesModule", "WorkspaceMaintenanceService"],
    "model-catalog": ["ModelCatalogModule", "ModelMaintenanceService"],
  };
  for (const [feature, names] of Object.entries(symbols)) {
    const file = `src/modules/${feature}/${feature}.public.ts`;
    const ast = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const exports = ast.statements.flatMap((statement) =>
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
        ? statement.exportClause.elements.map((item) => item.name.text)
        : [],
    );
    expect(exports.sort(), file).toEqual(names.sort());
  }
});

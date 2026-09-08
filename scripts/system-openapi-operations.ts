import type { z } from "zod";
import {
  pageQuerySchema as pageQuery,
  pageSchema as page,
} from "../src/http/protocol.schema.js";
import * as sites from "../src/modules/sites/schemas/site.schema.js";
import * as policy from "../src/modules/sites/schemas/policy.schema.js";
import * as workspaces from "../src/modules/workspaces/schemas/workspace.schema.js";
import * as products from "../src/modules/products/schemas/product.schema.js";
import * as apps from "../src/modules/products/schemas/application.schema.js";
import * as features from "../src/modules/products/schemas/feature.schema.js";
import * as presentation from "../src/modules/products/schemas/presentation.schema.js";
import * as configs from "../src/modules/products/schemas/config.schema.js";
import * as releases from "../src/modules/products/schemas/release.schema.js";
import * as manifests from "../src/modules/runtime-manifests/schemas/manifest.schema.js";
import * as definitions from "../src/modules/model-catalog/schemas/definition.schema.js";
import * as providers from "../src/modules/model-catalog/schemas/provider.schema.js";
import * as labels from "../src/modules/model-catalog/schemas/label.schema.js";
import * as revisions from "../src/modules/model-catalog/schemas/revision.schema.js";
import * as resolve from "../src/modules/model-catalog/schemas/resolve.schema.js";

export type SystemOperation = Readonly<{
  path: string;
  method: "get" | "post" | "patch" | "put" | "delete";
  operationId: string;
  module: string;
  permission: string;
  scope: "tenant" | "global" | "conditional";
  mutation: boolean;
  cas: "none" | "required" | "upsert";
  response: z.ZodType;
  body?: z.ZodType;
  query?: z.ZodType;
  status: number;
}>;
const operations: SystemOperation[] = [];
function add(
  path: string,
  method: SystemOperation["method"],
  operationId: string,
  module: string,
  response: z.ZodType,
  options: Partial<
    Omit<
      SystemOperation,
      "path" | "method" | "operationId" | "module" | "response"
    >
  > = {},
): void {
  const mutation = method !== "get";
  operations.push({
    path: `/v1/system/${path}`,
    method,
    operationId,
    module,
    response,
    permission: mutation ? "system:write" : "system:read",
    scope: "tenant",
    mutation,
    cas: mutation && method !== "post" ? "required" : "none",
    status: 200,
    ...options,
  });
}
function crud(
  path: string,
  id: string,
  name: string,
  module: string,
  input: z.ZodType,
  update: z.ZodType,
  response: z.ZodType,
  global = false,
): void {
  add(path, "get", `list${name}`, module, page(response), { query: pageQuery });
  add(path, "post", `create${name}`, module, response, {
    body: input,
    status: 201,
    scope: global ? "global" : "tenant",
  });
  add(`${path}/{${id}}`, "get", `get${name}`, module, response);
  add(`${path}/{${id}}`, "patch", `update${name}`, module, response, {
    body: update,
    scope: global ? "global" : "tenant",
  });
  add(`${path}/{${id}}`, "delete", `delete${name}`, module, response, {
    scope: global ? "global" : "tenant",
  });
  add(`${path}/{${id}}/restore`, "post", `restore${name}`, module, response, {
    scope: global ? "global" : "tenant",
    cas: "required",
  });
}
crud(
  "sites",
  "site_id",
  "Site",
  "sites",
  sites.siteInputSchema,
  sites.siteUpdateSchema,
  sites.siteSchema,
);
add(
  "sites/{site_id}/domains",
  "get",
  "listDomain",
  "sites",
  page(sites.domainSchema),
  { query: pageQuery },
);
add(
  "sites/{site_id}/domains",
  "post",
  "addDomain",
  "sites",
  sites.domainSchema,
  { body: sites.domainInputSchema, status: 201 },
);
add(
  "sites/{site_id}/domains/{domain_id}",
  "delete",
  "removeDomain",
  "sites",
  sites.domainSchema,
);
add("sites/{site_id}/policy", "get", "getPolicy", "sites", policy.policySchema);
add(
  "sites/{site_id}/policy",
  "put",
  "putPolicy",
  "sites",
  policy.policySchema,
  { body: policy.policyInputSchema, cas: "upsert" },
);
crud(
  "workspaces",
  "workspace_id",
  "Workspace",
  "workspaces",
  workspaces.workspaceInputSchema,
  workspaces.workspaceUpdateSchema,
  workspaces.workspaceSchema,
);
crud(
  "products",
  "product_id",
  "Product",
  "products",
  products.productInputSchema,
  products.productUpdateSchema,
  products.productSchema,
  true,
);
crud(
  "applications",
  "application_id",
  "Application",
  "products",
  apps.applicationInputSchema,
  apps.applicationUpdateSchema,
  apps.applicationSchema,
);
add(
  "features",
  "get",
  "listFeature",
  "products",
  page(features.featureSchema),
  { query: pageQuery },
);
add("features", "post", "createFeature", "products", features.featureSchema, {
  body: features.featureInputSchema,
  scope: "global",
  permission: "system:publish",
  status: 201,
});
add(
  "features/{feature_id}",
  "get",
  "getFeature",
  "products",
  features.featureSchema,
);
add(
  "features/{feature_id}/retire",
  "post",
  "retireFeature",
  "products",
  features.featureSchema,
  { cas: "required", scope: "global", permission: "system:publish" },
);
add(
  "applications/{application_id}/exposures",
  "get",
  "listExposure",
  "products",
  page(features.exposureSchema),
  { query: pageQuery },
);
add(
  "applications/{application_id}/exposures/{feature_id}",
  "put",
  "putExposure",
  "products",
  features.exposureSchema,
  { body: features.exposureInputSchema, cas: "upsert" },
);
add(
  "applications/{application_id}/exposures/{feature_id}",
  "delete",
  "deleteExposure",
  "products",
  features.exposureSchema,
);
add(
  "applications/{application_id}/presentation",
  "get",
  "getPresentation",
  "products",
  presentation.presentationSchema,
  { query: presentation.presentationQuerySchema },
);
add(
  "applications/{application_id}/presentation",
  "put",
  "putPresentation",
  "products",
  presentation.presentationSchema,
  {
    body: presentation.presentationInputSchema,
    query: presentation.presentationQuerySchema,
    cas: "upsert",
  },
);
add("config", "get", "listConfig", "products", page(configs.configSchema), {
  query: configs.configListQuerySchema,
  scope: "conditional",
});
add("config", "post", "saveConfig", "products", configs.configSchema, {
  body: configs.configInputSchema,
  scope: "conditional",
  status: 201,
});
add(
  "config/{config_id}",
  "get",
  "getConfig",
  "products",
  configs.configSchema,
  { scope: "conditional", query: configs.configScopeQuerySchema },
);
add(
  "config/{config_id}",
  "patch",
  "updateConfig",
  "products",
  configs.configSchema,
  {
    body: configs.configUpdateSchema,
    scope: "conditional",
    query: configs.configScopeQuerySchema,
  },
);
add(
  "config/{config_id}",
  "delete",
  "deleteConfig",
  "products",
  configs.configSchema,
  { scope: "conditional", query: configs.configScopeQuerySchema },
);
add(
  "releases",
  "get",
  "listRelease",
  "products",
  page(releases.releaseSchema),
  { query: pageQuery },
);
add("releases", "post", "createRelease", "products", releases.releaseSchema, {
  body: releases.releaseInputSchema,
  status: 201,
});
add(
  "releases/{release_id}",
  "get",
  "getRelease",
  "products",
  releases.releaseSchema,
);
for (const transition of ["validate", "publish", "retire"])
  add(
    `releases/{release_id}/${transition}`,
    "post",
    `${transition}Release`,
    "products",
    releases.releaseSchema,
    { permission: "system:publish", cas: "required" },
  );
add(
  "release-bindings",
  "get",
  "listBinding",
  "products",
  page(releases.bindingSchema),
  { query: pageQuery },
);
add(
  "release-bindings",
  "post",
  "createBinding",
  "products",
  releases.bindingSchema,
  {
    body: releases.bindingInputSchema,
    permission: "system:publish",
    status: 201,
  },
);
add(
  "release-bindings/{binding_id}",
  "delete",
  "deleteBinding",
  "products",
  releases.bindingSchema,
  { permission: "system:publish" },
);
add(
  "runtime-manifest",
  "get",
  "getRuntimeManifest",
  "runtime-manifests",
  manifests.manifestSchema,
  {
    query: manifests.manifestQuerySchema,
    permission: "service-context-and-site-policy",
  },
);
crud(
  "model-catalog/definitions",
  "model_id",
  "ModelDefinition",
  "model-catalog",
  definitions.definitionInputSchema,
  definitions.definitionUpdateSchema,
  definitions.definitionSchema,
  true,
);
crud(
  "model-catalog/providers",
  "provider_id",
  "ModelProvider",
  "model-catalog",
  providers.providerInputSchema,
  providers.providerUpdateSchema,
  providers.providerSchema,
  true,
);
crud(
  "model-catalog/labels",
  "label_id",
  "ModelLabel",
  "model-catalog",
  labels.labelInputSchema,
  labels.labelUpdateSchema,
  labels.labelSchema,
  true,
);
add(
  "model-catalog/providers/{provider_id}/health",
  "put",
  "putProviderHealth",
  "model-catalog",
  providers.healthSchema,
  { body: providers.healthInputSchema, scope: "global", cas: "upsert" },
);
add(
  "model-catalog/revisions",
  "get",
  "listModelRevision",
  "model-catalog",
  page(revisions.revisionSchema),
  { query: pageQuery },
);
add(
  "model-catalog/revisions",
  "post",
  "createModelRevision",
  "model-catalog",
  revisions.revisionSchema,
  { body: revisions.revisionInputSchema, scope: "global", status: 201 },
);
add(
  "model-catalog/revisions/{revision_id}",
  "get",
  "getModelRevision",
  "model-catalog",
  revisions.revisionSchema,
);
add(
  "model-catalog/revisions/{revision_id}",
  "patch",
  "updateModelRevisionDraft",
  "model-catalog",
  revisions.revisionSchema,
  { body: revisions.revisionUpdateSchema, scope: "global" },
);
for (const transition of ["publish", "retire"])
  add(
    `model-catalog/revisions/{revision_id}/${transition}`,
    "post",
    `${transition}ModelRevision`,
    "model-catalog",
    revisions.revisionSchema,
    { scope: "global", cas: "required", permission: "system:publish" },
  );
add(
  "model-catalog/routing-policies",
  "get",
  "listRoutingPolicy",
  "model-catalog",
  page(labels.routingSchema),
  { query: pageQuery },
);
add(
  "model-catalog/routing-policies/{label_id}",
  "put",
  "putRoutingPolicy",
  "model-catalog",
  labels.routingSchema,
  { body: labels.routingInputSchema, cas: "upsert" },
);
add(
  "model-catalog/routing-policies/{label_id}",
  "delete",
  "deleteRoutingPolicy",
  "model-catalog",
  labels.routingSchema,
);
add(
  "model-catalog/catalog",
  "get",
  "getModelCatalog",
  "model-catalog",
  page(resolve.catalogItemSchema),
  { query: resolve.catalogQuerySchema, permission: "service-context" },
);
add(
  "model-catalog/resolve",
  "post",
  "resolveModel",
  "model-catalog",
  resolve.resolveSchema,
  {
    body: resolve.resolveInputSchema,
    mutation: false,
    permission: "service-context",
  },
);
export const systemOperations: readonly SystemOperation[] = operations;

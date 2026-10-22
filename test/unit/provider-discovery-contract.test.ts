import { describe, expect, it } from "vitest";
import { systemOperations } from "../../scripts/system-openapi-operations.js";
describe("explicit provider upstream discovery contract", () => {
  it("declares a non-mutating global write read rather than a credential proxy", () => {
    const operation = systemOperations.find(
      (item) => item.operationId === "listModelProviderUpstreamModels",
    );
    expect(operation).toMatchObject({
      path: "/v1/system/model-catalog/providers/{provider_id}/upstream-models",
      method: "get",
      scope: "global",
      permission: "system:write",
      mutation: false,
      cas: "none",
      status: 200,
    });
  });
});

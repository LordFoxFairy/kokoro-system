import { SetMetadata } from "@nestjs/common";
export type AccessRule = Readonly<{
  permission: string;
  scope?: "tenant" | "global" | "conditional";
  mutation?: boolean;
  cas?: "required" | "upsert";
  operation: string;
}>;
export const ACCESS_RULE = "system:access-rule";
export const Access = (rule: AccessRule): MethodDecorator =>
  SetMetadata(ACCESS_RULE, rule);

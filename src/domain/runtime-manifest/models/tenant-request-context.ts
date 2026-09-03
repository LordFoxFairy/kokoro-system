export type TenantRequestContext = Readonly<{
  tenantId: string;
  actorId: string | null;
  organizationId: string | null;
  surfaceId: string | null;
  permissions: readonly string[];
  correlationId: string;
}>;

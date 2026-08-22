import type { TenantBindingVerifier } from "../../modules/runtime-manifest/ports.js";
import type { TenantRequestContext } from "../../modules/runtime-manifest/model.js";

export class IamTenantBindingClient implements TenantBindingVerifier {
  public constructor(private readonly baseUrl: string, private readonly backendToken: string) {}
  public async verify(input: Readonly<{ context: TenantRequestContext; host: string }>): Promise<void> {
    const url = new URL("/internal/iam/tenant-binding", `${this.baseUrl}/`);
    url.searchParams.set("host", input.host.replace(/:\d+$/u, "").toLowerCase());
    const response = await fetch(url, { headers: { authorization: `Bearer ${this.backendToken}` } });
    if (!response.ok) throw new Error("IAM tenant binding rejected");
    const body = await response.json() as { data?: { tenantId?: string } };
    if (body.data?.tenantId !== input.context.tenantId) throw new Error("IAM tenant binding rejected");
  }
}

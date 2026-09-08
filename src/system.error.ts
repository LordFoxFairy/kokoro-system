export type SystemErrorCode =
  | "INVALID_ARGUMENT"
  | "service_auth_failed"
  | "FORBIDDEN"
  | "IDEMPOTENCY_KEY_REUSED"
  | "SYSTEM_UNAVAILABLE"
  | "PRECONDITION_REQUIRED"
  | "VERSION_CONFLICT"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "RESOURCE_IN_USE"
  | "INVALID_STATE"
  | "ROUTE_NOT_FOUND"
  | "POLICY_DENIED"
  | "MODEL_UNAVAILABLE"
  | "SITE_UNAVAILABLE"
  | "INVALID_CONFIG_SCHEMA"
  | "HOST_CONFLICT"
  | "POLICY_INVALID";
export class SystemError extends Error {
  public constructor(
    public readonly code: SystemErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "SystemError";
  }
}

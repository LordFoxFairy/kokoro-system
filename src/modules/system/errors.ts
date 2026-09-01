export class SystemDomainError extends Error {
  public constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "SystemDomainError";
  }
}

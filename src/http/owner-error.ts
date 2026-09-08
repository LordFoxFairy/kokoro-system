export class OwnerError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "OwnerError";
  }
}

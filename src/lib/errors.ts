export class UserError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "UserError";
    this.status = status;
    this.details = details;
  }
}

export class ProviderError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body = "") {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.body = body;
  }
}

// Branded error types for rate limiter failures.
// Uses WeakMap to brand errors privately — invisible to JSON.stringify.

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

const errorBrands = new WeakMap<Error, string>();

export class RateLimitExecutionTimeout extends RateLimitError {
  constructor(message: string, retryAfterMs: number = 0) {
    super(message, 'RATE_LIMIT_EXECUTION_TIMEOUT', retryAfterMs);
    this.name = 'RateLimitExecutionTimeout';
    errorBrands.set(this, this.code);
  }
}

export class RateLimitQueueFull extends RateLimitError {
  constructor(message: string, retryAfterMs: number = 0) {
    super(message, 'RATE_LIMIT_QUEUE_FULL', retryAfterMs);
    this.name = 'RateLimitQueueFull';
    errorBrands.set(this, this.code);
  }
}

export class RateLimitQueueWedged extends RateLimitError {
  constructor(message: string, retryAfterMs: number = 0) {
    super(message, 'RATE_LIMIT_QUEUE_WEDGED', retryAfterMs);
    this.name = 'RateLimitQueueWedged';
    errorBrands.set(this, this.code);
  }
}

export function getErrorBrand(err: Error): string | undefined {
  return errorBrands.get(err);
}

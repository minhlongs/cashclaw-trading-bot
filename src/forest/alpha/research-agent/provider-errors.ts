export type ProviderErrorCode =
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'PROVIDER_UNAVAILABLE'
  | 'INJECTION_REJECTED'
  | 'SCHEMA_VIOLATION';

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly providerName: string;

  constructor(
    message: string,
    options?: { code?: ProviderErrorCode; providerName?: string; cause?: unknown },
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = options?.code ?? 'PROVIDER_UNAVAILABLE';
    this.providerName = options?.providerName ?? 'unknown';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const ResearchProviderError = ProviderError;
export type ResearchProviderError = ProviderError;

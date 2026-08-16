/**
 * Branded error codes using WeakMap.
 *
 * The WeakMap keeps error codes invisible to JSON.stringify,
 * Object.keys, and object spread — safe for structured logging
 * and serialization boundaries.
 */

export const ERROR_CODES = {
  RATE_LIMIT: 'RATE_LIMIT',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  INVALID_ORDER: 'INVALID_ORDER',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  EXCHANGE_DOWN: 'EXCHANGE_DOWN',
  NETWORK_ERROR: 'NETWORK_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

const codeMap = new WeakMap<Error, string>();

export function brandError(err: Error, code: string): Error {
  codeMap.set(err, code);
  return err;
}

export function getErrorCode(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  return codeMap.get(err) ?? null;
}

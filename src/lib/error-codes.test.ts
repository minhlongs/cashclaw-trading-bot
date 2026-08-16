import { describe, it, expect } from 'vitest';
import { brandError, getErrorCode, ERROR_CODES } from './error-codes';

describe('error-codes', () => {
  it('brandError attaches code retrievable via getErrorCode', () => {
    const err = new Error('rate limited');
    brandError(err, ERROR_CODES.RATE_LIMIT);
    expect(getErrorCode(err)).toBe('RATE_LIMIT');
  });

  it('getErrorCode returns null for non-branded error', () => {
    const err = new Error('bare error');
    expect(getErrorCode(err)).toBeNull();
  });

  it('getErrorCode returns null for non-Error value', () => {
    expect(getErrorCode('string')).toBeNull();
    expect(getErrorCode(null)).toBeNull();
    expect(getErrorCode(undefined)).toBeNull();
    expect(getErrorCode(42)).toBeNull();
  });

  it('brandError does not add enumerable property', () => {
    const err = new Error('hidden');
    brandError(err, ERROR_CODES.VALIDATION_ERROR);
    const keys = Object.keys(err);
    expect(keys).not.toContain('errorCode');
    expect(keys).not.toContain('code');
  });

  it('JSON.stringify of branded error does NOT include code', () => {
    const err = new Error('serializable');
    brandError(err, ERROR_CODES.INTERNAL_ERROR);
    const json = JSON.parse(JSON.stringify(err));
    expect(json).not.toHaveProperty('code');
    expect(json).not.toHaveProperty('errorCode');
  });

  it('ERROR_CODES has all expected keys', () => {
    const expected = [
      'RATE_LIMIT',
      'CIRCUIT_OPEN',
      'INVALID_ORDER',
      'INSUFFICIENT_BALANCE',
      'EXCHANGE_DOWN',
      'NETWORK_ERROR',
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'INTERNAL_ERROR',
      'UNKNOWN_ERROR',
    ] as const;
    expect(Object.keys(ERROR_CODES)).toEqual(expected);
  });

  it('all ERROR_CODES entries are strings', () => {
    for (const value of Object.values(ERROR_CODES)) {
      expect(typeof value).toBe('string');
    }
  });

  it('multiple brandings work independently', () => {
    const a = new Error('first');
    const b = new Error('second');
    brandError(a, ERROR_CODES.RATE_LIMIT);
    brandError(b, ERROR_CODES.NETWORK_ERROR);

    expect(getErrorCode(a)).toBe('RATE_LIMIT');
    expect(getErrorCode(b)).toBe('NETWORK_ERROR');

    // Re-branding b doesn't affect a
    brandError(b, ERROR_CODES.EXCHANGE_DOWN);
    expect(getErrorCode(a)).toBe('RATE_LIMIT');
    expect(getErrorCode(b)).toBe('EXCHANGE_DOWN');
  });
});

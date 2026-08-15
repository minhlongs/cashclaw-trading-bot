import { describe, it, expect } from 'vitest';
import { normalizeExchangeError, type ExchangeError } from './error-normalizer';

function kind(err: ExchangeError): ExchangeError['kind'] {
  return err.kind;
}
function retryable(err: ExchangeError): boolean {
  return err.retryable;
}

describe('normalizeExchangeError', () => {
  it('classifies Error objects', () => {
    const e = new Error('429 Too Many Requests');
    const n = normalizeExchangeError(e);
    expect(kind(n)).toBe('rate_limit');
    expect(retryable(n)).toBe(true);
  });

  it('classifies exchange_down from timeout', () => {
    const n = normalizeExchangeError(new Error('ETIMEDOUT connection failed'));
    expect(kind(n)).toBe('exchange_down');
    expect(retryable(n)).toBe(true);
  });

  it('classifies invalid_order', () => {
    const n = normalizeExchangeError(new Error('Order rejected: already filled'));
    expect(kind(n)).toBe('invalid_order');
    expect(retryable(n)).toBe(false);
  });

  it('classifies insufficient_balance', () => {
    const n = normalizeExchangeError(new Error('Insufficient balance for requested amount'));
    expect(kind(n)).toBe('insufficient_balance');
    expect(retryable(n)).toBe(false);
  });

  it('classifies transient network error', () => {
    const n = normalizeExchangeError(new Error('fetch failed socket hang up'));
    expect(kind(n)).toBe('transient');
    expect(retryable(n)).toBe(true);
  });

  it('falls back to unknown', () => {
    const n = normalizeExchangeError(new Error('Something weird'));
    expect(kind(n)).toBe('unknown');
    expect(retryable(n)).toBe(false);
  });

  it('handles string input', () => {
    const n = normalizeExchangeError('429 Too Many');
    expect(kind(n)).toBe('rate_limit');
  });

  it('handles object with message field', () => {
    const n = normalizeExchangeError({ message: 'ETIMEDOUT', code: -1000 });
    expect(kind(n)).toBe('exchange_down');
  });

  it('handles null/undefined gracefully', () => {
    const n = normalizeExchangeError(null);
    expect(kind(n)).toBe('unknown');
    const n2 = normalizeExchangeError(undefined);
    expect(kind(n2)).toBe('unknown');
  });

  it('preserves upstream reference', () => {
    const raw = new Error('original');
    const n = normalizeExchangeError(raw);
    expect(n.upstream).toBe(raw);
  });

  it('sanitizes empty message', () => {
    const n = normalizeExchangeError(new Error(''));
    expect(n.message).toBe('Unknown exchange error');
  });
});
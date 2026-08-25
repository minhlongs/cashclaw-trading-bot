import { describe, it, expect } from 'vitest';
import { RoutingConfigSchema } from './routing-types';

describe('RoutingConfigSchema', () => {
  it('accepts a valid round-robin config', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'round-robin',
      exchanges: ['binance', 'bybit', 'okx'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a valid pinned config', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'pinned',
      exchanges: ['binance', 'bybit'],
      pinnedExchange: 'binance',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts best-health config', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'best-health',
      exchanges: ['okx'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty exchanges list', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'round-robin',
      exchanges: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown strategy', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'random',
      exchanges: ['binance'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects unknown exchange id', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'round-robin',
      exchanges: ['binance', 'kraken'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects pinned strategy without pinnedExchange', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'pinned',
      exchanges: ['binance', 'bybit'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects pinned strategy when pinnedExchange is not in exchanges', () => {
    const parsed = RoutingConfigSchema.safeParse({
      strategy: 'pinned',
      exchanges: ['binance'],
      pinnedExchange: 'okx',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(RoutingConfigSchema.safeParse(null).success).toBe(false);
    expect(RoutingConfigSchema.safeParse('binance').success).toBe(false);
  });
});

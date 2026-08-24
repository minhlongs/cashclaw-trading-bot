// Parser tests: realistic Binance-shaped fixtures plus an exhaustive table of
// bad inputs. Every bad path must return {ok:false} with a specific reason —
// no throw, no partial snapshot (fail-closed acceptance).
//
// Note: live Binance depth/aggTrades bodies carry string numerics; the forest
// fetcher converts them to numbers BEFORE calling these parsers, so fixtures
// here use numbers and strings are treated as invalid input.

import { describe, expect, it } from 'vitest';
import { parseAggTradesPayload, parseDepthPayload } from './parse';

const RECEIVED_AT = 1_756_000_000_000;

/** Realistic /api/v3/depth body (limit=3), numerics already converted. */
const GOOD_DEPTH = {
  lastUpdateId: 402_197_561,
  bids: [
    [104_063.99, 0.113],
    [104_063.98, 0.286],
    [104_063.97, 0.4],
  ],
  asks: [
    [104_064.0, 0.358],
    [104_064.01, 0.047],
    [104_064.02, 0.561],
  ],
};

/** Realistic /api/v3/aggTrades entry (extra wire fields f/l/M included). */
const GOOD_TRADES = [
  { a: 1_234_567, p: 104_063.99, q: 0.01, f: 100, l: 100, T: RECEIVED_AT - 5_000, m: false, M: true },
  { a: 1_234_568, p: 104_064.0, q: 0.05, f: 101, l: 101, T: RECEIVED_AT - 1_000, m: true, M: true },
];

describe('parseDepthPayload', () => {
  it('accepts a realistic payload and stamps exchangeTs from receivedAtMs', () => {
    const result = parseDepthPayload(GOOD_DEPTH, RECEIVED_AT);
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
    expect(result.payload.lastUpdateId).toBe(402_197_561);
    expect(result.payload.bids[0]).toEqual({ price: 104_063.99, quantity: 0.113 });
    expect(result.payload.asks[0]).toEqual({ price: 104_064.0, quantity: 0.358 });
    expect(result.payload.exchangeTs).toBe(RECEIVED_AT);
    // Ordering is preserved verbatim — validation happens in quality.ts.
    expect(result.payload.bids).toHaveLength(3);
    expect(result.payload.asks).toHaveLength(3);
  });

  const badCases: ReadonlyArray<[string, unknown, RegExp]> = [
    ['null payload', null, /not an object/],
    ['array payload', [], /not an object/],
    ['missing lastUpdateId', { bids: GOOD_DEPTH.bids, asks: GOOD_DEPTH.asks }, /lastUpdateId/],
    ['string lastUpdateId', { ...GOOD_DEPTH, lastUpdateId: '402197561' }, /lastUpdateId/],
    ['float lastUpdateId', { ...GOOD_DEPTH, lastUpdateId: 1.5 }, /lastUpdateId/],
    ['negative lastUpdateId', { ...GOOD_DEPTH, lastUpdateId: -1 }, /lastUpdateId/],
    ['NaN price level', { ...GOOD_DEPTH, bids: [[Number.NaN, 1]] }, /bid level/],
    ['Infinity qty level', { ...GOOD_DEPTH, asks: [[1, Number.POSITIVE_INFINITY]] }, /ask level/],
    ['zero quantity level', { ...GOOD_DEPTH, bids: [[100, 0]] }, /bid level/],
    ['string-as-number level', { ...GOOD_DEPTH, bids: [['100', '1']] }, /bid level/],
    ['level not a pair', { ...GOOD_DEPTH, bids: [[100]] }, /bid level/],
    ['level is object', { ...GOOD_DEPTH, bids: [{ price: 1 }] }, /bid level/],
    ['empty bids', { ...GOOD_DEPTH, bids: [] }, /bids missing or empty/],
    ['missing asks', { lastUpdateId: 1, bids: GOOD_DEPTH.bids }, /asks missing or empty/],
    ['null bids', { ...GOOD_DEPTH, bids: null }, /bids missing or empty/],
  ];

  for (const [name, payload, reason] of badCases) {
    it(`rejects ${name}`, () => {
      const result = parseDepthPayload(payload, RECEIVED_AT);
      if (result.ok) throw new Error(`expected rejection for case: ${name}`);
      expect(result.reason).toMatch(reason);
    });
  }

  it('rejects a non-finite receivedAtMs stamp', () => {
    const result = parseDepthPayload(GOOD_DEPTH, Number.NaN);
    if (result.ok) throw new Error('expected rejection');
    expect(result.reason).toMatch(/receivedAtMs/);
  });

  it('rejects a negative receivedAtMs stamp', () => {
    const result = parseDepthPayload(GOOD_DEPTH, -1);
    if (result.ok) throw new Error('expected rejection');
    expect(result.reason).toMatch(/receivedAtMs/);
  });
});

describe('parseAggTradesPayload', () => {
  it('accepts realistic prints and maps to normalized TradePrint', () => {
    const result = parseAggTradesPayload(GOOD_TRADES);
    if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
    expect(result.payload[0]).toEqual({
      id: 1_234_567,
      price: 104_063.99,
      quantity: 0.01,
      isBuyerMaker: false,
      ts: RECEIVED_AT - 5_000,
    });
    expect(result.payload[1].isBuyerMaker).toBe(true);
  });

  const badCases: ReadonlyArray<[string, unknown, RegExp]> = [
    ['null payload', null, /not a non-empty array/],
    ['object payload', {}, /not a non-empty array/],
    ['empty array', [], /not a non-empty array/],
    ['null entry', [null], /entry is not an object/],
    ['array entry', [[1, 2]], /entry is not an object/],
    ['missing id', [{ p: 1, q: 1, T: 1, m: true }], /'a'/],
    ['string id', [{ a: 'x', p: 1, q: 1, T: 1, m: true }], /'a'/],
    ['zero id', [{ a: 0, p: 1, q: 1, T: 1, m: true }], /'a'/],
    ['string price', [{ a: 1, p: '1', q: 1, T: 1, m: true }], /'p'/],
    ['negative qty', [{ a: 1, p: 1, q: -1, T: 1, m: true }], /'q'/],
    ['NaN ts', [{ a: 1, p: 1, q: 1, T: Number.NaN, m: true }], /'T'/],
    ['implausible ts', [{ a: 1, p: 1, q: 1, T: 12345, m: true }], /'T'/],
    ['missing flag m', [{ a: 1, p: 1, q: 1, T: RECEIVED_AT }], /'m'/],
    ['numeric flag m', [{ a: 1, p: 1, q: 1, T: RECEIVED_AT, m: 1 }], /'m'/],
  ];

  for (const [name, payload, reason] of badCases) {
    it(`rejects ${name}`, () => {
      const result = parseAggTradesPayload(payload);
      if (result.ok) throw new Error(`expected rejection for case: ${name}`);
      expect(result.reason).toMatch(reason);
    });
  }
});

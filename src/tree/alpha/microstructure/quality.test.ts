// Quality-check tests: one pass + one fail case per check, plus the
// determinism invariant (same input → same report, no hidden Date.now()).
// All wall-clock values are injected as parameters.

import { describe, expect, it } from 'vitest';
import { MAX_STALE_DRIFT_MS, validateDepth, validateTradeBatch } from './quality';
import type { DepthPayload, TradePrint } from './snapshot-types';

const NOW = 1_756_000_000_000;

function depthFixture(): DepthPayload {
  return {
    lastUpdateId: 1,
    exchangeTs: NOW - 1_000,
    bids: [
      { price: 100.02, quantity: 1.0 },
      { price: 100.01, quantity: 2.0 },
      { price: 100.0, quantity: 3.0 },
    ],
    asks: [
      { price: 100.03, quantity: 1.5 },
      { price: 100.04, quantity: 2.5 },
      { price: 100.05, quantity: 3.5 },
    ],
  };
}

/** Two prints 1s apart ending 1s before NOW — fresh and monotonic. */
function tradesFixture(): TradePrint[] {
  return [
    { id: 10, price: 100.01, quantity: 0.5, isBuyerMaker: false, ts: NOW - 2_000 },
    { id: 11, price: 100.02, quantity: 0.7, isBuyerMaker: true, ts: NOW - 1_000 },
  ];
}

describe('validateDepth', () => {
  it('accepts a well-formed uncrossed book', () => {
    expect(validateDepth(depthFixture(), NOW)).toEqual({
      valid: true,
      reasons: [],
    });
  });

  const failCases: ReadonlyArray<[string, (d: DepthPayload) => void, RegExp]> = [
    [
      'crossed book (best bid >= best ask)',
      d => {
        d.bids[0].price = d.asks[0].price; // locked book
      },
      /crossed book/,
    ],
    [
      'zero bid quantity',
      d => {
        d.bids[1].quantity = 0;
      },
      /qty .* <= 0/,
    ],
    [
      'negative ask quantity',
      d => {
        d.asks[2].quantity = -0.5;
      },
      /qty .* <= 0/,
    ],
    [
      'bids not descending',
      d => {
        d.bids[1].price = d.bids[0].price + 1;
      },
      /bids not descending/,
    ],
    [
      'asks not ascending',
      d => {
        d.asks[1].price = d.asks[0].price - 1;
      },
      /asks not ascending/,
    ],
    ['empty bids', d => {
      d.bids = [];
    }, /bids empty/],
    ['empty asks', d => {
      d.asks = [];
    }, /asks empty/],
  ];

  for (const [name, mutate, reason] of failCases) {
    it(`rejects ${name}`, () => {
      const payload = depthFixture();
      mutate(payload);
      const report = validateDepth(payload, NOW);
      expect(report.valid).toBe(false);
      expect(report.reasons[0]).toMatch(reason);
    });
  }

  it('is deterministic: same input → identical report', () => {
    const a = validateDepth(depthFixture(), NOW);
    const b = validateDepth(depthFixture(), NOW);
    expect(a).toEqual(b);
  });
});

describe('validateTradeBatch', () => {
  it('accepts a fresh monotonic batch and reports coverage', () => {
    const report = validateTradeBatch(tradesFixture(), NOW);
    expect(report.valid).toBe(true);
    expect(report.complete).toBe(true); // ids 11−10 = 1 ≥ default window 1
  });

  it('rejects an empty batch', () => {
    const report = validateTradeBatch([], NOW);
    expect(report.valid).toBe(false);
    expect(report.reasons[0]).toMatch(/empty/);
  });

  it('rejects a stale batch beyond drift threshold', () => {
    // Last print older than the 60 s staleness limit.
    const stale = tradesFixture().map(p => ({ ...p, ts: p.ts - MAX_STALE_DRIFT_MS * 2 }));
    const report = validateTradeBatch(stale, NOW);
    expect(report.valid).toBe(false);
    expect(report.reasons[0]).toMatch(/stale/);
  });

  it('rejects non-monotonic timestamps', () => {
    const outOfOrder = [tradesFixture()[1], tradesFixture()[0]];
    const report = validateTradeBatch(outOfOrder, NOW);
    expect(report.valid).toBe(false);
    expect(report.reasons[0]).toMatch(/non-monotonic/);
  });

  it('rejects duplicate trade ids', () => {
    const dup = [...tradesFixture(), { ...tradesFixture()[1] }];
    const report = validateTradeBatch(dup, NOW);
    expect(report.valid).toBe(false);
    expect(report.reasons[0]).toMatch(/duplicate trade id 11/);
  });

  it('marks incomplete when id span does not cover the window', () => {
    const report = validateTradeBatch(tradesFixture(), NOW, 50);
    expect(report.valid).toBe(true);
    expect(report.complete).toBe(false);
  });

  it('marks complete when id span covers the window', () => {
    const wide: TradePrint[] = [
      { ...tradesFixture()[0], id: 10 },
      { ...tradesFixture()[1], id: 59 },
    ];
    const report = validateTradeBatch(wide, NOW, 49);
    expect(report.valid).toBe(true);
    expect(report.complete).toBe(true);
  });

  it('is deterministic: same input → identical report', () => {
    const a = validateTradeBatch(tradesFixture(), NOW, 5);
    const b = validateTradeBatch(tradesFixture(), NOW, 5);
    expect(a).toEqual(b);
  });

  it('exports the staleness threshold as a named constant', () => {
    expect(MAX_STALE_DRIFT_MS).toBe(60_000);
  });
});

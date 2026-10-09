import { describe, it, expect } from 'vitest';
import { SlippageAttributionLedger } from '../../src/tree/execution/attribution/slippage-attribution-ledger';
import type { ExecutionFillRecord } from '../../src/tree/execution/attribution/slippage-attribution-types';

describe('Phase 03: Slippage Attribution Ledger', () => {
  it('correctly decomposes execution slippage into components', () => {
    const ledger = new SlippageAttributionLedger();

    const arrivalPrice = 2000.0;
    const fills: ExecutionFillRecord[] = [
      { sliceIndex: 0, arrivalPrice: 2000.0, executionPrice: 2000.5, quantity: 2.0, venue: 'binance', timestamp: 1000 },
      { sliceIndex: 1, arrivalPrice: 2000.0, executionPrice: 2001.0, quantity: 3.0, venue: 'okx', timestamp: 2000 },
    ];

    const result = ledger.attributeExecutionSlippage('ORD-TEST-99', arrivalPrice, fills, 2000.3);

    expect(result.orderId).toBe('ORD-TEST-99');
    expect(result.totalExecutedQuantity).toBe(5.0);
    expect(result.arrivalPrice).toBe(2000.0);
    expect(result.vwapExecutionPrice).toBe(2000.8);
    expect(result.totalSlippageBps).toBeGreaterThan(0);
    expect(result.halfSpreadBps).toBe(2.5);
    expect(result.permanentDriftBps).toBeGreaterThanOrEqual(0);
  });

  it('handles empty fills safely', () => {
    const ledger = new SlippageAttributionLedger();
    const result = ledger.attributeExecutionSlippage('ORD-EMPTY', 2000.0, []);

    expect(result.totalExecutedQuantity).toBe(0);
    expect(result.totalSlippageBps).toBe(0);
  });
});

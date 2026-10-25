import { describe, it, expect } from 'vitest';
import { GreeksHedgingDesk } from './index';

describe('GreeksHedgingDesk', () => {
  const desk = new GreeksHedgingDesk({
    maxDeltaExposure: 5.0,
    maxGammaExposure: 2.0,
    maxVegaExposure: 500.0,
  });

  it('detects safe Greeks exposure without generating rebalancing orders', () => {
    const safeGreeks = { delta: 1.2, gamma: 0.5, vega: 120 };
    const res = desk.evaluateAndHedge(safeGreeks);

    expect(res.isBreached).toBe(false);
    expect(res.rebalanceOrders).toHaveLength(0);
  });

  it('triggers linear perp hedge when Delta breaches risk threshold', () => {
    const highDelta = { delta: 12.5, gamma: 0.5, vega: 100 };
    const res = desk.evaluateAndHedge(highDelta);

    expect(res.isBreached).toBe(true);
    expect(res.rebalanceOrders).toHaveLength(1);
    expect(res.rebalanceOrders[0]?.instrument).toBe('PERP_UNDERLYING');
    expect(res.rebalanceOrders[0]?.action).toBe('SELL');
    expect(res.rebalanceOrders[0]?.quantity).toBe(12.5);
  });

  it('triggers option hedge when Vega breaches tolerance', () => {
    const highVega = { delta: 0, gamma: 0.5, vega: -800 };
    const res = desk.evaluateAndHedge(highVega);

    expect(res.isBreached).toBe(true);
    expect(res.rebalanceOrders).toHaveLength(1);
    expect(res.rebalanceOrders[0]?.instrument).toBe('OPTION_STRADDLE');
    expect(res.rebalanceOrders[0]?.action).toBe('BUY');
    expect(res.rebalanceOrders[0]?.quantity).toBe(16);
  });
});

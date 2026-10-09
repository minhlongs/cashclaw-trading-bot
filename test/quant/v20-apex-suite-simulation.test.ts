import { describe, it, expect } from 'vitest';
import { GarmanKlassVolatilityEngine } from '@/tree/quantlib/volatility/garman-klass-volatility-engine';
import { HasbrouckVarEngine } from '@/tree/quantlib/microstructure/hasbrouck-var-engine';
import { validateCandleSeries } from '@/tree/alpha/data-quality/validator';
import { evaluateOperationalTelemetryBatch } from '@/tree/alpha/observability/attribution-telemetry';
import type { Candle } from '@/tree/alpha/data-quality/types';
import type { OperationalTelemetry } from '@/tree/alpha/observability/types';

describe('V20 Multi-Domain Apex Suite Simulation', () => {
  it('simulates end-to-end quant flow: GK volatility estimation -> Hasbrouck VAR flow -> data quality fence -> operational telemetry', () => {
    // 1. Garman-Klass Volatility Estimation
    const gkEngine = new GarmanKlassVolatilityEngine();
    const bars = [
      { open: 100, high: 102.5, low: 99.5, close: 101.8 },
      { open: 102.0, high: 104.0, low: 101.0, close: 103.5 },
      { open: 103.2, high: 105.5, low: 102.8, close: 104.9 },
      { open: 104.5, high: 107.0, low: 104.0, close: 106.2 },
    ];
    const volResult = gkEngine.estimate(bars);
    expect(volResult.parkinsonVolatility).toBeGreaterThan(0);
    expect(volResult.garmanKlassVolatility).toBeGreaterThan(0);

    // 2. Hasbrouck VAR Trade Flow Shock Decomposition
    const hasbrouckEngine = new HasbrouckVarEngine();
    const trades = [
      { midPrice: 101.8, tradeSign: 1, volume: 50 },
      { midPrice: 102.4, tradeSign: 1, volume: 70 },
      { midPrice: 103.5, tradeSign: 1, volume: 100 },
      { midPrice: 103.2, tradeSign: -1, volume: 30 },
      { midPrice: 104.9, tradeSign: 1, volume: 120 },
    ];
    const varResult = hasbrouckEngine.calculate(trades);
    expect(varResult.permanentPriceImpact).toBeGreaterThan(0);
    expect(varResult.informationShare).toBeGreaterThanOrEqual(0);

    // 3. Data Quality Gate Verification (Refactored Modular Validator)
    const candles: Candle[] = [
      { timestamp: 1000, open: 100, high: 102.5, low: 99.5, close: 101.8, volume: 500 },
      { timestamp: 2000, open: 102.0, high: 104.0, low: 101.0, close: 103.5, volume: 600 },
      { timestamp: 3000, open: 103.2, high: 105.5, low: 102.8, close: 104.9, volume: 750 },
    ];
    const qualityResult = validateCandleSeries(candles);
    expect(qualityResult.valid).toBe(true);
    expect(qualityResult.status).toBe('VALID');

    // 4. Operational Telemetry Aggregation (Refactored Modular Telemetry)
    const telemetry: OperationalTelemetry[] = [
      {
        decisionLatencyMs: 25,
        dataFreshnessMs: 150,
        providerProvenance: {
          primaryProvider: 'binance-rest',
          activeProvider: 'binance-rest',
          usedFallback: false,
          fallbackAttempts: 0,
          providerLatencyMs: 20,
        },
        timestamp: Date.now(),
      },
      {
        decisionLatencyMs: 35,
        dataFreshnessMs: 220,
        providerProvenance: {
          primaryProvider: 'binance-rest',
          activeProvider: 'binance-rest',
          usedFallback: false,
          fallbackAttempts: 0,
          providerLatencyMs: 30,
        },
        timestamp: Date.now() + 1000,
      },
    ];
    const telemetrySummary = evaluateOperationalTelemetryBatch(telemetry);
    expect(telemetrySummary.count).toBe(2);
    expect(telemetrySummary.provenance.primarySuccessRate).toBe(1);
    expect(telemetrySummary.alarms.length).toBe(0);
  });
});

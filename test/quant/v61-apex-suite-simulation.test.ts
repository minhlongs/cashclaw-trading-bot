import { describe, it, expect } from 'vitest';
import { RogersSatchellVolatilityEngine } from '@/tree/quantlib/volatility/rogers-satchell-engine';
import { BipowerJumpEngine } from '@/tree/quantlib/volatility/bipower-jump-engine';
import { ContDeLarrardEngine } from '@/tree/quantlib/microstructure/cont-delarrard-engine';
import { ChordiaTradingActivityEngine } from '@/tree/quantlib/microstructure/chordia-trading-activity-engine';
import type { OhlcBar } from '@/tree/quantlib/volatility/rogers-satchell-types';
import type { DailyActivity } from '@/tree/quantlib/microstructure/chordia-trading-activity-types';

describe('Triad v61 Golden Apex Suite Simulation', () => {
  it('orchestrates drift-independent volatility, jump diffusion, queue depletion and liquidity volatility', () => {
    // 1. Rogers-Satchell drift-independent volatility estimation
    const bars: OhlcBar[] = [
      { open: 100, high: 106, low: 99, close: 105 },
      { open: 105, high: 111, low: 103, close: 110 },
      { open: 110, high: 115, low: 108, close: 114 },
      { open: 114, high: 120, low: 112, close: 119 },
    ];
    const rs = RogersSatchellVolatilityEngine.calculate({ bars, annualizationFactor: 365 });
    expect(rs.annualizedVolatility).toBeGreaterThan(0);
    expect(rs.driftIndependent).toBe(true);

    // 2. Barndorff-Nielsen & Shephard jump detection
    const returns = [0.01, -0.015, 0.008, 0.082, -0.009, 0.012, -0.007];
    const jump = BipowerJumpEngine.calculate({ returns, significanceLevel: 0.05 });
    expect(jump.realizedVariance).toBeGreaterThan(0);
    expect(jump.bipowerVariation).toBeGreaterThan(0);
    expect(jump.jumpVariation).toBeGreaterThan(0);

    // 3. Cont & de Larrard Markovian queue depletion
    const queue = ContDeLarrardEngine.calculate({
      bidQueueSize: 75,
      askQueueSize: 25,
      arrivalRate: 15,
      cancellationRate: 5,
      marketOrderRate: 10,
    });
    expect(queue.probPriceIncrease).toBe(0.75);
    expect(queue.queueImbalance).toBe(0.5);
    expect(queue.expectedDepletionTime).toBeGreaterThan(0);

    // 4. Chordia trading activity & liquidity volatility
    const activities: DailyActivity[] = [
      { volume: 50_000, sharesOutstanding: 500_000 },
      { volume: 80_000, sharesOutstanding: 500_000 },
      { volume: 65_000, sharesOutstanding: 500_000 },
      { volume: 110_000, sharesOutstanding: 500_000 },
    ];
    const chordia = ChordiaTradingActivityEngine.calculate({ activities });
    expect(chordia.meanTurnover).toBeGreaterThan(0);
    expect(chordia.turnoverVolatility).toBeGreaterThan(0);
    expect(chordia.sampleDays).toBe(4);
  });
});

import { describe, it, expect } from 'vitest';
import { detectMarketRegime } from './volatility-regime-detector';
import { updateBanditArms, sampleBetaAllocation } from './thompson-sampling-bandit';
import type { BanditArmState, StrategyPerformanceReward } from './bandit-types';

describe('Adaptive Regime & Bayesian MAB Allocator', () => {
  it('correctly classifies volatility regime under varying market metrics', () => {
    // 1. Low vol chop
    const chop = detectMarketRegime({ annualizedVolPct: 20.0, vpinToxicity: 0.15 });
    expect(chop.regime).toBe('LOW_VOL_CHOP');
    expect(chop.confidence).toBeGreaterThan(0.7);

    // 2. High vol crisis
    const crisis = detectMarketRegime({ annualizedVolPct: 85.0, vpinToxicity: 0.72 });
    expect(crisis.regime).toBe('HIGH_VOL_CRISIS');
    expect(crisis.confidence).toBeGreaterThan(0.7);

    // 3. Trending momentum
    const trending = detectMarketRegime({ annualizedVolPct: 50.0, vpinToxicity: 0.4 });
    expect(trending.regime).toBe('TRENDING_MOMENTUM');
  });

  it('updates bandit arm pseudo-counts according to strategy performance', () => {
    const initialArms: BanditArmState[] = [
      { strategyId: 'grid', alpha: 1.0, beta: 1.0 },
      { strategyId: 'volatility_dca', alpha: 1.0, beta: 1.0 },
    ];

    const rewards: StrategyPerformanceReward[] = [
      { strategyId: 'grid', sortinoRatio: 2.5, maxDrawdownPct: 0.02, winRatePct: 70 },
      { strategyId: 'volatility_dca', sortinoRatio: -1.0, maxDrawdownPct: 0.12, winRatePct: 35 },
    ];

    const updated = updateBanditArms(initialArms, rewards);
    const gridArm = updated.find((a) => a.strategyId === 'grid');
    const dcaArm = updated.find((a) => a.strategyId === 'volatility_dca');

    expect(gridArm?.alpha).toBeGreaterThan(initialArms[0].alpha);
    expect(dcaArm?.beta).toBeGreaterThan(initialArms[1].beta);
  });

  it('samples weights honoring exploration floor and regime preference', () => {
    const arms: BanditArmState[] = [
      { strategyId: 'grid_btc', alpha: 10.0, beta: 2.0 },
      { strategyId: 'mean_reversion_eth', alpha: 2.0, beta: 8.0 },
      { strategyId: 'volatility_dca_sol', alpha: 5.0, beta: 5.0 },
    ];

    const weightsChop = sampleBetaAllocation(arms, 'LOW_VOL_CHOP', [0.5, 0.5, 0.5], 5.0);

    expect(weightsChop).toHaveLength(3);
    const totalPct = weightsChop.reduce((sum, w) => sum + w.targetWeightPct, 0);
    expect(totalPct).toBeCloseTo(100.0, 1);

    // Every arm must respect exploration floor >= 5.0%
    for (const w of weightsChop) {
      expect(w.targetWeightPct).toBeGreaterThanOrEqual(5.0);
    }

    // Grid should get highest weight due to high alpha and LOW_VOL_CHOP regime boost
    const gridWeight = weightsChop.find((w) => w.strategyId === 'grid_btc')?.targetWeightPct ?? 0;
    const meanRevWeight = weightsChop.find((w) => w.strategyId === 'mean_reversion_eth')?.targetWeightPct ?? 0;
    expect(gridWeight).toBeGreaterThan(meanRevWeight);
  });
});

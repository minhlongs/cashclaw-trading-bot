import { describe, it, expect } from 'vitest';
import { computeHrpAllocation, computeSampleVariance } from './hrp-allocator';
import type { BotPerformanceRecord } from './fleet-types';

describe('Hierarchical Risk Parity (HRP) Allocator', () => {
  it('computes sample variance correctly', () => {
    const series = [0.01, -0.01, 0.02, -0.02];
    const variance = computeSampleVariance(series);
    expect(variance).toBeGreaterThan(0);
  });

  it('allocates higher weights to lower variance strategies', () => {
    const bots: BotPerformanceRecord[] = [
      {
        botId: 'bot-low-vol',
        strategyKind: 'funding_arb',
        returnsSeries: [0.001, 0.002, 0.001, 0.002], // Low variance
        currentAllocationUsd: 10000,
        maxDrawdownPct: 0.02,
      },
      {
        botId: 'bot-high-vol',
        strategyKind: 'grid',
        returnsSeries: [0.05, -0.04, 0.06, -0.05], // High variance
        currentAllocationUsd: 10000,
        maxDrawdownPct: 0.15,
      },
    ];

    const res = computeHrpAllocation(bots, 1000);
    expect(res.allocations['bot-low-vol']).toBeGreaterThan(res.allocations['bot-high-vol']);
    expect(res.clusterOrder[0]).toBe('bot-low-vol');
    expect(
      res.allocations['bot-low-vol'] + res.allocations['bot-high-vol'],
    ).toBeCloseTo(1.0, 5);
  });

  it('handles empty bot fleet gracefully', () => {
    const res = computeHrpAllocation([]);
    expect(Object.keys(res.allocations).length).toBe(0);
  });
});

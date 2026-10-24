import { describe, it, expect } from 'vitest';
import { computeObizhaevaWangExecution } from '@/tree/quantlib/execution/obizhaeva-wang-execution-engine';
import { computeGKNSpreadDecomposition } from '@/tree/quantlib/microstructure/gkn-spread-engine';
import { ResearchAgent } from '@/forest/alpha/research-agent/agent';
import { ValidationResultSchema } from '@/forest/alpha/data-quality-eval/schemas';
import type { GKNPriceBar } from '@/tree/quantlib/microstructure/gkn-spread-engine';

describe('Triad v25 Apex Multi-Domain Suite Simulation', () => {
  it('integrates GKN microstructure decomposition with Obizhaeva-Wang optimal liquidation', async () => {
    const bars: GKNPriceBar[] = [
      { price: 50000, midpoint: 50000 },
      { price: 50020, midpoint: 50005 },
      { price: 49980, midpoint: 50000 },
      { price: 50025, midpoint: 50010 },
      { price: 49975, midpoint: 50005 },
      { price: 50030, midpoint: 50015 },
    ];
    const gkn = computeGKNSpreadDecomposition(bars);
    expect(gkn.spread).toBeGreaterThan(0);
    expect(gkn.orderProcessingShare + gkn.adverseSelectionShare).toBeCloseTo(1.0, 6);

    const ow = computeObizhaevaWangExecution({
      totalShares: 25000,
      numSteps: 8,
      resilienceRate: 0.75,
      timeStep: 1.0,
      orderBookDepth: 10000,
    });
    expect(ow.expectedCost).toBeLessThan(ow.immediateCost);
    expect(ow.trajectory).toHaveLength(8);
    expect(ow.impactSavings).toBeGreaterThan(0);

    const agent = new ResearchAgent({
      provider: {
        name: 'mock-provider',
        generateCompletion: async () => JSON.stringify({
          clusters: [
            { clusterId: 'c1', theme: 'Resilient Microstructure', memberIds: ['hyp-1', 'hyp-2'], redundancyScore: 0.1, recommendedRepresentativeId: 'hyp-1' },
          ],
        }),
      },
    });

    const clusters = await agent.clusterHypotheses({
      hypotheses: [
        { id: 'hyp-1', title: 'Resilient LOB Dynamics 1', rationale: 'Microstructure impact decay' },
        { id: 'hyp-2', title: 'Resilient LOB Dynamics 2', rationale: 'Microstructure resilience' },
      ],
    });
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.theme).toBe('Resilient Microstructure');

    const parsedValidation = ValidationResultSchema.safeParse({
      valid: true,
      status: 'VALID',
      checkResults: [],
      violations: [],
      totalCandles: 100,
    });
    expect(parsedValidation.success).toBe(true);
  });
});

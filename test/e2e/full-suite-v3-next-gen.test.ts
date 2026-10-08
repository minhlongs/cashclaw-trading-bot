import { describe, it, expect } from 'vitest';
import { calculateTwapSlices } from '@/tree/execution/smart/twap-slicer';
import { evaluateExecutionUrgency } from '@/tree/execution/smart/microstructure-urgency-guard';
import { routeOrderSlices } from '@/tree/execution/smart/sor-router';
import { simulateLiquidityShock } from '@/forest/risk/stress/liquidity-void-simulator';
import { estimatePortfolioTailRiskMultiplier } from '@/forest/risk/stress/copula-tail-dependence';
import { calculatePortfolioCvar } from '@/forest/risk/stress/cvar-calculator';
import type { VenueLiquidityProfile } from '@/tree/execution/smart/smart-execution-types';

describe('Full-Suite v3 Next-Gen Cross-Stack E2E Integration', () => {
  it('executes the full cycle from extreme liquidity shock to smart execution throttling and copula CVaR protection', () => {
    // 1. Extreme Market Shock Simulation (Black Swan Flash Crash)
    const baseMid = 60000;
    const baseSpread = 2.0;
    const baseDepth = 50.0;

    const stressed = simulateLiquidityShock(baseMid, baseSpread, baseDepth, {
      scenarioName: 'Depeg & Liquidity Void',
      spreadMultiplier: 8,
      depthDepletionRatio: 0.80,
      priceShockPct: -0.20,
    });

    expect(stressed.shockedMidPrice).toBe(48000);
    expect(stressed.stressedSpread).toBe(16.0);
    expect(stressed.stressedDepth).toBe(10.0);

    // 2. Microstructure Toxicity Assessment
    // Under extreme shock, VPIN indicates highly informed toxic selling (0.82) and adverse OFI
    const urgency = evaluateExecutionUrgency({
      vpinToxicity: 0.82,
      ofiSignal: -0.65,
      intendedSide: 'buy',
    });

    expect(urgency.mode).toBe('PAUSED_COOLDOWN');

    // 3. Smart Order Routing (SOR) with Slicing once cooldown relaxes to benign/cautious
    const twapSlices = calculateTwapSlices({
      totalQuantity: 3.0,
      durationMinutes: 15,
      sliceCount: 3,
    });
    expect(twapSlices).toHaveLength(3);

    const venues: VenueLiquidityProfile[] = [
      {
        exchange: 'binance',
        topAskPrice: 48010,
        topBidPrice: 47994,
        depthSize: 1.5,
        takerFeeBps: 8,
        makerFeeBps: 2,
      },
      {
        exchange: 'okx',
        topAskPrice: 48005,
        topBidPrice: 47990,
        depthSize: 2.0,
        takerFeeBps: 6,
        makerFeeBps: 1,
      },
    ];

    const routed = routeOrderSlices(twapSlices[0].targetQuantity, 'buy', venues);
    expect(routed.length).toBeGreaterThan(0);
    // OKX has cheaper effective ask price, gets allocated first
    expect(routed[0].exchange).toBe('okx');

    // 4. Stressed Portfolio Tail-Risk & CVaR Assessment
    const tailRisk = estimatePortfolioTailRiskMultiplier({ claytonTheta: 1.5 }, [0.75, 0.85]);
    expect(tailRisk.lowerTailDependence).toBeGreaterThan(0.5);

    // 5. CVaR Expected Shortfall under 99% confidence
    const simulatedLosses = Array.from({ length: 100 }, (_, i) => (i + 1) * 200 * tailRisk.tailRiskMultiplier);
    const cvar = calculatePortfolioCvar(simulatedLosses, 500000, 0.99);

    expect(cvar.parametricVarUsd).toBeGreaterThan(0);
    expect(cvar.expectedShortfallCvarUsd).toBeGreaterThan(cvar.parametricVarUsd);
  });
});

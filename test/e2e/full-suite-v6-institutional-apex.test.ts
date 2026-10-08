import { describe, it, expect } from 'vitest';

// Pillar 1: SLR
import { calculateOrderBookImbalance, estimateMicroPrice } from '../../src/tree/execution/slr/micro-price-estimator';
import { routePassiveLimitOrder } from '../../src/tree/execution/slr/passive-execution-router';

// Pillar 2: Flow Toxicity & Hawkes
import { initializeVpinState, updateContinuousVpin } from '../../src/tree/quantlib/toxicity/continuous-vpin-streamer';
import { estimateHawkesIntensity, detectWhaleSweep } from '../../src/tree/quantlib/toxicity/hawkes-process-detector';
import type { HawkesPointEvent, HawkesProcessModel } from '../../src/tree/quantlib/toxicity/toxicity-types';

// Pillar 3: HRP & Copula Tail Risk
import { correlationToDistance, buildSingleLinkageDendrogram, quasiDiagonalize } from '../../src/forest/allocation/hrp/dendrogram-clusterer';
import { allocateRecursiveBisection, generateHrpPortfolio } from '../../src/forest/allocation/hrp/hrp-capital-allocator';
import { calculateClaytonTailRisk } from '../../src/forest/allocation/hrp/copula-tail-risk-guard';

describe('E2E Full-Suite v6 Institutional Apex Pipeline', () => {
  it('executes end-to-end: Smart Limit Route -> Flow Toxicity Alert -> HRP Reallocation', () => {
    // -------------------------------------------------------------------------
    // HORIZON 1: Microstructure Execution Guard & Smart Limit Routing
    // -------------------------------------------------------------------------
    // Scenario: Trying to buy into a severely imbalanced orderbook (Toxic Sell Pressure)
    const obi = calculateOrderBookImbalance(100.0, 1.0, 100.5, 50.0); // 50x heavier asks
    const micro = estimateMicroPrice(obi);
    
    // Check Micro-price drift is downward
    expect(micro.microPrice).toBeCloseTo(100.01, 2);
    expect(micro.driftBps).toBeLessThan(-5.0); // Huge drift down

    // Try routing a buy limit order
    const slrResult = routePassiveLimitOrder(obi, 'buy', 0.5, 15.0, 2.0); // Strict toxicity threshold 2.0 bps
    
    // The execution should be rejected (cancel-on-toxicity) due to adverse drift
    expect(slrResult.orderPlaced).toBe(false);
    expect(slrResult.cancelTriggered).toBe(true);
    expect(slrResult.reason).toContain('Toxic sell sweep expected');

    // -------------------------------------------------------------------------
    // HORIZON 2: Microstructure Flow Toxicity (VPIN) & Hawkes Detection
    // -------------------------------------------------------------------------
    // Toxicity streamer registers a large sequence of sells
    let vpinState = initializeVpinState();
    vpinState = updateContinuousVpin(vpinState, 5, 95, 100, 50); // Huge sell bucket
    vpinState = updateContinuousVpin(vpinState, 2, 98, 100, 50); // Second huge sell bucket
    
    expect(vpinState.currentVpin).toBeGreaterThan(0.7); // Highly toxic informed flow
    expect(vpinState.thresholdCdf).toBeGreaterThan(0.9); // 90%+ probability anomaly

    // Continuous event feed into self-exciting Hawkes Process Detector
    const events: HawkesPointEvent[] = [
      { timestampMs: 10000, magnitude: 15.0, side: 'sell' },
      { timestampMs: 10500, magnitude: 25.0, side: 'sell' }, // Self-excitation triggers
      { timestampMs: 10600, magnitude: 40.0, side: 'sell' },
    ];
    const hawkesModel: HawkesProcessModel = { baselineIntensityMu: 1.0, jumpExcitationAlpha: 2.5, decayRateBeta: 1.0 };
    
    const hawkesIntensity = estimateHawkesIntensity(events, hawkesModel, 11000, 15.0); // threshold 15.0
    expect(hawkesIntensity.isBursting).toBe(true);
    // Whale Sweep Detection Signal triggers!
    const sweep = detectWhaleSweep(events, hawkesIntensity, 5000);
    expect(sweep.detected).toBe(true);
    expect(sweep.dominantSide).toBe('sell');
    expect(sweep.severityScore).toBeGreaterThan(0.8);

    // -------------------------------------------------------------------------
    // HORIZON 3: HRP Portfolio Re-balancing & Copula Tail Risk Protection
    // -------------------------------------------------------------------------
    // The sell sweep represents a market crash. We re-assess the portfolio correlation.
    // In a crash, correlation between risk assets goes to 1.0, while stablecoins decorrelate.
    const crashAssets = ['BTC-L', 'ETH-L', 'SOL-L', 'USDT-STABLE'];
    const crashCorr = [
      [1.0, 0.95, 0.90, 0.0],
      [0.95, 1.0, 0.85, 0.0],
      [0.90, 0.85, 1.0, 0.0],
      [0.0, 0.0, 0.0, 1.0]
    ];
    // Volatilities spike as well
    const crashCov = [
      [0.4, 0.38, 0.35, 0.0],
      [0.38, 0.6, 0.40, 0.0],
      [0.35, 0.40, 0.8, 0.0],
      [0.0, 0.0, 0.0, 0.0001]
    ];

    // Build the Dendrogram and extract Quasi-Diagonal order
    const distMat = correlationToDistance(crashCorr);
    const root = buildSingleLinkageDendrogram(distMat);
    const leaves = quasiDiagonalize(root);

    // Recursive Bisection Allocation (Invert Variance without Matrix Inversion)
    const weights = allocateRecursiveBisection(leaves, crashCov);
    const portfolio = generateHrpPortfolio(crashAssets, weights);
    
    // Stablecoin safe-haven gets nearly all the weight due to HRP risk-parity shift
    const safeWeight = portfolio.find(p => p.asset === 'USDT-STABLE')?.weight ?? 0;
    const btcWeight = portfolio.find(p => p.asset === 'BTC-L')?.weight ?? 0;
    
    expect(safeWeight).toBeGreaterThan(0.9);
    expect(btcWeight).toBeLessThan(0.1);

    // Finally, run the Clayton Copula CVaR to estimate lower-tail crash impact
    // High lower-tail dependence during crashes (Kendall Tau ~ 0.7)
    const copulaCvar = calculateClaytonTailRisk(0.7, 1000.0, 1.5);
    
    expect(copulaCvar.claytonTheta).toBeCloseTo(4.6667, 3);
    expect(copulaCvar.lowerTailDependence).toBeGreaterThan(0.8);
    // Adjusted CVaR significantly amplifies base risk due to illiquidity + copula joint tail probability
    expect(copulaCvar.portfolioLiquidityAdjustedCvar).toBeGreaterThan(2000.0);
  });
});

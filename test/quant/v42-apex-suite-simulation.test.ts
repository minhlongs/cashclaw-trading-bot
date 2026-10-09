import { describe, it, expect } from 'vitest';
import { computeGueantTapiaExecution } from '@/tree/quantlib/execution/gueant-tapia-engine';
import { computeHasbrouckVecm } from '@/tree/quantlib/microstructure/hasbrouck-vecm-engine';
import { VolatilityDcaStrategy } from '@/tree/bot/strategies/volatility-dca';
import { buildPortfolio, type EngineScoredAlpha } from '@/tree/alpha/portfolio/engine';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import type { Ticker } from '@/tree/exchange/types';
import type { VolatilityDcaBotConfig } from '@/tree/bot/types';
import { RegimeLabel } from '@/tree/regime/types';

describe('Triad v42 Apex Multi-Domain Suite Cross-Domain Simulation', () => {
  it('integrates portfolio execution, VECM order flow, modular volatility DCA, and modular portfolio engine', () => {
    // 1. Hasbrouck VECM Order Flow Toxicity
    const vecmRes = computeHasbrouckVecm({
      ticks: [
        { midPrice: 2000, orderFlow: 0, spread: 0.5 },
        { midPrice: 2005, orderFlow: 10, spread: 0.5 },
        { midPrice: 2012, orderFlow: 20, spread: 0.6 },
      ],
    });
    expect(vecmRes.permanentPriceImpact).toBeGreaterThan(0);
    expect(vecmRes.toxicityScore).toBeGreaterThan(0);

    // 2. Guéant-Tapia Multi-Asset Portfolio Execution
    const execRes = computeGueantTapiaExecution({
      assets: [
        { symbol: 'ETH', shares: 50, price: 2000, volatility: 0.05, temporaryImpact: 1e-4 },
        { symbol: 'BTC', shares: 2, price: 60000, volatility: 0.04, temporaryImpact: 1e-4 },
      ],
      timeHorizon: 0.5,
      numSteps: 3,
      riskAversion: 1e-4,
    });
    expect(execRes.steps.length).toBe(3);
    expect(execRes.terminalShares.ETH).toBe(0);
    expect(execRes.terminalShares.BTC).toBe(0);

    // 3. Modular Volatility DCA Strategy
    const logs: string[] = [];
    const config: VolatilityDcaBotConfig = {
      strategy: 'volatility_dca',
      symbol: 'ETH/USDT',
      pair: 'ETH/USDT',
      exchange: 'binance',
      mode: 'paper',
      capital: 10000,
      maxDrawdownPct: 15,
      volatilityWindow: 2,
      volBaseline: 0.05,
      priceDropStep: 1,
      maxSteps: 3,
      reboundTarget: 2,
      baseOrderSizePct: 10,
    };
    const strat = new VolatilityDcaStrategy(config, { onLog: (msg) => logs.push(msg) });
    strat.start(2000);
    expect(strat.getReferencePrice()).toBe(2000);

    const makeTicker = (last: number, ts: number): Ticker => ({
      symbol: 'ETH/USDT',
      last,
      bid: last - 0.5,
      ask: last + 0.5,
      high24h: last + 50,
      low24h: last - 50,
      volume24h: 1000,
      timestamp: ts,
    });

    strat.onTicker(makeTicker(2000, 1000));
    strat.onTicker(makeTicker(1970, 2000));
    expect(strat.getStepIndex()).toBeGreaterThanOrEqual(0);
    strat.stop();

    // 4. Modular Portfolio Engine
    const mockAlpha: ComposedAlpha = {
      alphaId: 'alpha-1',
      direction: 'buy',
      confidence: 0.9,
      expectedReturn: 0.05,
      expectedCost: 0.001,
      expectedTurnover: 0.1,
      regime: RegimeLabel.TREND_UP,
      horizon: '1h',
      provenance: 'rule-based',
      featureDependencies: ['volatility'],
      timestamp: 1000,
    };
    const scored: EngineScoredAlpha[] = [{ alpha: mockAlpha, score: 0.8 }];
    const currentWeights = new Map<string, number>();
    const risk: RiskInputs = {
      realizedVolatility: 0.15,
      correlationMatrix: new Map(),
      betas: new Map(),
      currentDrawdown: 0.02,
    };
    const cfg: PortfolioConfig = {
      targetVolatility: 0.1,
      maxPositionWeight: 0.2,
      maxGrossExposure: 1.0,
      maxNetExposure: 0.5,
      correlationBucketThreshold: 0.7,
      maxCorrelatedExposure: 0.4,
      maxBetaExposure: 0.3,
      maxTurnover: 0.2,
      drawdownThreshold: 0.05,
      deRiskFactor: 0.5,
    };
    const portRes = buildPortfolio(scored, currentWeights, risk, cfg);
    expect(portRes.positions.length).toBe(1);
    expect(portRes.positions[0]!.alphaId).toBe('alpha-1');
    expect(portRes.drawdownDeRisked).toBe(false);
  });
});

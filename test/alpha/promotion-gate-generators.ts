import {
  computeCanonicalSha256,
  type PromotionGateInput,
} from './promotion-gate-fixtures';

export function createPassingGateInput(
  overrides: Partial<PromotionGateInput> = {},
): PromotionGateInput {
  const baseConfig = {
    strategyId: 'alpha-inst-mom-v1',
    gitSha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    seed: 42,
    universe: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  };
  const recordedHash = computeCanonicalSha256({
    gitSha: baseConfig.gitSha,
    seed: baseConfig.seed,
    config: baseConfig,
  });

  const defaultInput: PromotionGateInput = {
    numTrades: 145,
    expectancy: 0.0125,
    profitFactor: 1.95,
    maxDrawdown: 0.14,
    sharpe: 1.85,
    sortino: 2.30,
    byRegime: {
      TREND_UP: { numTrades: 45, netPnl: 8500 },
      TREND_DOWN: { numTrades: 35, netPnl: 4200 },
      RANGE: { numTrades: 30, netPnl: 1800 },
      HIGH_VOLATILITY: { numTrades: 20, netPnl: 2100 },
      LOW_VOLATILITY: { numTrades: 15, netPnl: 950 },
    },
    feeStress: {
      netPnlNormal: 17550,
      netPnlConservative: 14200,
    },
    slippageStress: {
      netPnlAdverse: 11200,
      netPnlExtreme: 5400,
    },
    parameterSensitivitySpread: 0.24,
    walkForwardPositiveFraction: 0.80,
    crossAsset: {
      positiveAssetFraction: 0.75,
      applicable: true,
    },
    leakageViolations: 0,
    windowPnls: [3800, 3100, 3600, 3450, 3600],
    baselineComparison: {
      candidate: { sharpe: 1.85, netPnl: 17550 },
      buyHold: { sharpe: 0.90, netPnl: 8200 },
      randomEntry: { sharpe: -0.15, netPnl: -1200 },
    },
    hashVerification: {
      gitSha: baseConfig.gitSha,
      seed: baseConfig.seed,
      config: baseConfig,
      recordedHash,
    },
  };

  return {
    ...defaultInput,
    ...overrides,
  };
}

export function createInstitutionalMomentumInput(): PromotionGateInput {
  return createPassingGateInput();
}

export function createHighTurnoverScalperInput(): PromotionGateInput {
  return createPassingGateInput({
    numTrades: 3500,
    expectancy: 0.0003,
    profitFactor: 1.25,
    maxDrawdown: 0.08,
    sharpe: 1.45,
    sortino: 1.60,
    feeStress: {
      netPnlNormal: 1200,
      netPnlConservative: -850,
    },
    slippageStress: {
      netPnlAdverse: -1500,
      netPnlExtreme: -6200,
    },
  });
}

export function createOverfitStrategyInput(): PromotionGateInput {
  return createPassingGateInput({
    parameterSensitivitySpread: 0.85,
    walkForwardPositiveFraction: 0.30,
    crossAsset: {
      positiveAssetFraction: 0.25,
      applicable: true,
    },
  });
}

export function createWindfallStrategyInput(): PromotionGateInput {
  return createPassingGateInput({
    windowPnls: [18000, 200, 150, 100, 50],
  });
}

export function createLookaheadLeakerInput(): PromotionGateInput {
  return createPassingGateInput({
    leakageViolations: 12,
  });
}

export function createBenchmarkLaggardInput(): PromotionGateInput {
  return createPassingGateInput({
    baselineComparison: {
      candidate: { sharpe: 1.15, netPnl: 6500 },
      buyHold: { sharpe: 1.75, netPnl: 15400 },
      randomEntry: { sharpe: -0.20, netPnl: -1800 },
    },
  });
}

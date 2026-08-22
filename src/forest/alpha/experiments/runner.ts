// Experiment Engine — Runner
// Executes an Experiment through train / validate / test pipeline and
// produces a structured ExperimentResult.

import type { Experiment, ExperimentResult, ExperimentDeps, RegimePerformance } from './types';
import { metricsFromBacktest, computeRegimePerformance, computeSymbolPerformance, emptyBacktest, computeExperimentHash } from './runner-helpers';

// ── Runner ───────────────────────────────────────────────────────────────────

/**
 * Run a full experiment: backtest on train / validate / test periods,
 * optional walk-forward, regime and symbol breakdowns, artifact snapshot.
 *
 * The reproducibility hash is computed at run start from (config + seed +
 * gitCommit) so identical inputs always produce the same hash. On failed or
 * killed runs, `falsificationReason` is populated from the gate output when
 * provided — otherwise it falls back to the underlying error message.
 */
export async function runExperiment(
  exp: Experiment,
  deps: ExperimentDeps,
  options: { gateReason?: string } = {},
): Promise<ExperimentResult> {
  const executedAt = new Date().toISOString();
  const experimentHash = await computeExperimentHash(exp);
  const falsificationReason = options.gateReason;

  const commonOpts: Record<string, unknown> = {
    feePct: exp.feeModel.type === 'percentage' ? exp.feeModel.value : undefined,
    slippagePct: exp.slippageModel.type === 'percentage' ? exp.slippageModel.value : undefined,
    botId: exp.id,
  };

  try {
    const trainBt = await deps.runBacktest([], { ...commonOpts, period: exp.trainPeriod });
    const validationBt = await deps.runBacktest([], { ...commonOpts, period: exp.validationPeriod });
    const testBt = await deps.runBacktest([], { ...commonOpts, period: exp.testPeriod });

    const walkForwardResult = await deps.runWalkForward([], {
      window: { trainBars: 0, validateBars: 0, testBars: 0, stepBars: 0 },
      period: exp.testPeriod,
      regimeFilter: exp.regimeFilter,
    }).catch(() => undefined);

    const regimePerformance = computeRegimePerformance(testBt, deps.classifyRegime, []);
    const symbolPerformance = computeSymbolPerformance(testBt, exp.symbol);

    return {
      experimentId: exp.id,
      executedAt,
      status: 'completed',
      experimentHash,
      trainMetrics: metricsFromBacktest(trainBt),
      validationMetrics: metricsFromBacktest(validationBt),
      testMetrics: metricsFromBacktest(testBt),
      walkForwardResult,
      trainBacktest: trainBt,
      validationBacktest: validationBt,
      testBacktest: testBt,
      regimePerformance,
      symbolPerformance,
      artifacts: [
        `experiments/${exp.id}/config.json`,
        `experiments/${exp.id}/train-backtest.json`,
        `experiments/${exp.id}/validation-backtest.json`,
        `experiments/${exp.id}/test-backtest.json`,
        `experiments/${exp.id}/result.json`,
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      experimentId: exp.id,
      executedAt,
      status: 'failed',
      experimentHash,
      falsificationReason: falsificationReason ?? message,
      trainMetrics: { sharpe: null, totalPnl: 0, tradeCount: 0, winRate: 0, maxDrawdown: 0 },
      validationMetrics: { sharpe: null, totalPnl: 0, tradeCount: 0, winRate: 0, maxDrawdown: 0 },
      testMetrics: { sharpe: null, totalPnl: 0, tradeCount: 0, winRate: 0, maxDrawdown: 0 },
      trainBacktest: emptyBacktest(),
      validationBacktest: emptyBacktest(),
      testBacktest: emptyBacktest(),
      regimePerformance: {} as RegimePerformance,
      symbolPerformance: {},
      artifacts: [],
      error: message,
    };
  }
}
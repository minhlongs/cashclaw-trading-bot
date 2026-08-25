// Arm evaluation + primary-arm battery for the real-data pairs verdict.
// Pure orchestration of existing primitives (walk-forward driver, adapters,
// robustness, ablation, survival gates) — no second engine, no I/O here.

import type { UniversePanel } from '@/tree/alpha/relative-value';
import type { Candle } from '@/forest/backtest/ohlcv';
import { runSurvivalGate } from '@/forest/alpha/gate/survival-gate';
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import { evaluateSurvival } from '@/forest/alpha/multiple-testing';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing';
import {
  assembleSurvivalInput,
  oosSpan,
  runBenchmarks,
  runRvAblation,
  runRvRobustness,
  runRVWalkForward,
  toEvaluationReport,
} from '@/forest/alpha/relative-value-eval';
import type { RVWalkForwardResult } from '@/forest/alpha/relative-value-eval';
import {
  ADAPTER,
  WINDOW_CONFIG,
  type ArmDef,
} from './rv-pairs-verdict-protocol';
import { writeArtifact } from './rv-pairs-verdict-artifacts';

export function runArm(def: ArmDef, universe: UniversePanel): RVWalkForwardResult {
  return runRVWalkForward({
    universe,
    windowConfig: WINDOW_CONFIG,
    mode: 'rolling',
    selectionConfig: def.selection,
    configFactory: () => def.sim,
  });
}

export interface ArmOutcome {
  readonly id: string;
  readonly expectancy: number;
  readonly periods: number;
  readonly completedTrades: number;
  readonly selectedPairCount: number;
  readonly gateStatus: string;
  readonly gateReason: string;
}

export function summarizeArm(
  id: string,
  result: RVWalkForwardResult,
): ArmOutcome {
  const report = toEvaluationReport(result.stitched.roundTripsSource, {
    ...ADAPTER,
    experimentId: `rv-${id.toLowerCase()}-oos`,
    symbol: `PAIRS/${id}`,
  });
  const gate = runSurvivalGate(report);
  return {
    id,
    expectancy: report.expectancy,
    periods: result.stitched.netReturns.length,
    completedTrades: report.numTrades,
    selectedPairCount: result.windows.reduce(
      (s, w) => s + w.selectedPairs.length, 0,
    ),
    gateStatus: gate.status,
    gateReason: gate.reason,
  };
}

export interface PrimaryEvaluation {
  readonly survival: SurvivalVerdict;
  readonly gate: SurvivalGateResult;
}

/** Full battery on PRIMARY arm M4: robustness → ablation → assembly → gates.
 * Fail-closed: if the survival input cannot be assembled (e.g. fewer than 2
 * completed trades), the verdict is falsified with the reason recorded — the
 * script still writes artifacts instead of crashing. */
export function evaluatePrimaryM4(
  m4: RVWalkForwardResult,
  m4Def: ArmDef,
  universe: UniversePanel,
): PrimaryEvaluation {
  const robustness = runRvRobustness({
    universe,
    windowConfig: WINDOW_CONFIG,
    mode: 'rolling',
    selectionConfig: m4Def.selection,
    baseSimConfig: stripArmKnobs(m4Def.sim),
  });
  const ablation = runRvAblation({
    universe,
    windowConfig: WINDOW_CONFIG,
    mode: 'rolling',
    selectionConfig: m4Def.selection,
    configFactory: () => m4Def.sim,
  });
  const report = toEvaluationReport(m4.stitched.roundTripsSource, ADAPTER);
  const gate = runSurvivalGate(report);
  const survival = runSurvivalBattery(m4, m4Def, universe, robustness.configMatrix);
  writeArtifact('rv-pairs-m4-survival.json', {
    survival,
    gateChecks: gate.checks,
    benchmarks: runBenchmarks(
      Object.fromEntries(
        universe.symbols.map((_, i) => [universe.symbols[i], candlesFrom(universe, i)]),
      ),
      oosSpan(m4.stitched.roundTripsSource),
      {
        timeframe: ADAPTER.timeframe,
        stressMode: 'conservative',
        feePct: 0.0008,
        slipPct: 0.0003,
      },
    ).rows,
    ablation,
    robustnessSensitivity: robustness.sensitivity,
    robustnessGridSize: robustness.entries.length,
    pboMatrixShape: {
      configs: robustness.configMatrix.length,
      windows: robustness.configMatrix[0]?.length ?? 0,
    },
    report: {
      expectancy: report.expectancy,
      numTrades: report.numTrades,
      profitFactor: report.profitFactor,
      sharpe: report.sharpe,
      maxDrawdownFraction: report.maxDrawdown,
      totalReturn: report.totalReturn,
    },
  });
  return { survival, gate };
}

/** Assemble + evaluate the multiple-testing battery; falsify on assembly
 * failure rather than throwing (honest KILLED, artifacts still written). */
function runSurvivalBattery(
  m4: RVWalkForwardResult,
  m4Def: ArmDef,
  universe: UniversePanel,
  configMatrix: readonly (readonly number[])[],
): SurvivalVerdict {
  try {
    const crossAssetReports = m4.perPairWindows
      .filter((pw) => pw.oosPeriods.length > 0)
      .map((pw) =>
        toEvaluationReport(pw.oosPeriods, { ...ADAPTER, symbol: pw.pairLabel }));
    const input = assembleSurvivalInput(
      m4,
      candlesFrom(universe, 0),
      configMatrix,
      crossAssetReports,
      {
        adapterOptions: ADAPTER,
        bootstrap: { iterations: 2000, confidence: 0.95, seed: 42 },
        permutation: { iterations: 1000, seed: 43 },
        walkForwardOptions: { minPositiveFraction: 0.5, maxSignFlips: 2 },
        crossAssetOptions: { minPositiveFraction: 0.5, minAssets: 2 },
        maxPbo: 0.5,
      },
    );
    return evaluateSurvival(input);
  } catch (err) {
    return {
      verdict: 'falsified',
      reasons: [
        `survival_input: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/** Robustness grid varies entryZ/hedgeWindow/stressMode itself — the base
 * sim config must not carry M4's entry filter or frozen-β knob. */
function stripArmKnobs(sim: ArmDef['sim']): ArmDef['sim'] {
  return { ...sim, hedgeMode: undefined, entryFilter: undefined };
}

function candlesFrom(universe: UniversePanel, index: number): Candle[] {
  return universe.timestamps.map((t, i) => ({
    timestamp: t,
    open: universe.closes[index]![i]!,
    high: universe.closes[index]![i]!,
    low: universe.closes[index]![i]!,
    close: universe.closes[index]![i]!,
    volume: 0,
  }));
}

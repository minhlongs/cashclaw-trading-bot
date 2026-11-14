// Gate G13 & G15: < 15 bps/month TrackingErrorReconciler & Fail-Closed Honesty Gate.
// Gate G15 invariant: liveTradingUnlocked is ALWAYS false regardless of G13 verdict.

import type {
  G13Verdict,
  OracleReplayCheckpoint,
  PaperForwardCheckpoint,
  TrackingErrorReconciliationReport,
} from './spec-types';

export const DEFAULT_G13_MIN_REQUIRED_DAYS = 60;
export const DEFAULT_G13_TARGET_DAYS = 90;
export const DEFAULT_MAX_TRACKING_ERROR_BPS_PER_MONTH = 15.0;
export const DEFAULT_AUTO_KILL_BPS_PER_MONTH = 25.0;
const DAYS_PER_MONTH = 30;
const BPS_MULTIPLIER = 10_000;

export interface EvaluateG13GateInput {
  readonly paperCheckpoints: readonly PaperForwardCheckpoint[];
  readonly oracleCheckpoints: readonly OracleReplayCheckpoint[];
  readonly minRequiredDays?: number;
  readonly targetDays?: number;
  readonly maxTrackingErrorBpsPerMonth?: number;
  readonly autoKillBpsPerMonth?: number;
  readonly ledgerBreachCount?: number;
  readonly protectionViolationCount?: number;
}

interface ReturnSeriesStats {
  readonly validAlignment: boolean;
  readonly alignmentError: string;
  readonly elapsedDays: number;
  readonly checkpointLedgerBreaches: number;
  readonly dailyReturnDiffs: readonly number[];
  readonly maeMonthlyBps: number;
  readonly rmseMonthlyBps: number;
  readonly terminalNavDiscrepancyBps: number;
}

function isPositiveFiniteNav(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function computeStdDev(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  if (samples.length === 1) return Math.abs(samples[0] as number);
  const mean = samples.reduce((acc, v) => acc + v, 0) / samples.length;
  const sumSq = samples.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / (samples.length - 1));
}

function makeInvalidStats(alignmentError: string, checkpointLedgerBreaches = 0): ReturnSeriesStats {
  return {
    validAlignment: false, alignmentError, elapsedDays: 0, checkpointLedgerBreaches,
    dailyReturnDiffs: [], maeMonthlyBps: 0, rmseMonthlyBps: 0, terminalNavDiscrepancyBps: 0,
  };
}

function alignAndComputeReturnDiffs(
  paper: readonly PaperForwardCheckpoint[],
  oracle: readonly OracleReplayCheckpoint[],
): ReturnSeriesStats {
  if (paper.length === 0 || paper.length !== oracle.length) {
    return makeInvalidStats('Paper and oracle checkpoint sequences must be non-empty and equal length');
  }
  const sortedPaper = [...paper].sort((a, b) => a.dayIndex - b.dayIndex);
  const oracleByDay = new Map(oracle.map((o) => [o.dayIndex, o.oracleNav]));
  let checkpointLedgerBreaches = 0;
  for (const cp of sortedPaper) {
    if (!cp.ledgerBalanced) checkpointLedgerBreaches += 1;
    if (!isPositiveFiniteNav(oracleByDay.get(cp.dayIndex)) || !isPositiveFiniteNav(cp.paperNav)) {
      return makeInvalidStats(`Missing or non-positive NAV at dayIndex=${cp.dayIndex}`, checkpointLedgerBreaches);
    }
  }

  const diffs: number[] = [];
  for (let i = 1; i < sortedPaper.length; i += 1) {
    const prevP = sortedPaper[i - 1] as PaperForwardCheckpoint;
    const currP = sortedPaper[i] as PaperForwardCheckpoint;
    const prevO = oracleByDay.get(prevP.dayIndex) as number;
    const currO = oracleByDay.get(currP.dayIndex) as number;
    const span = Math.max(1, currP.dayIndex - prevP.dayIndex);
    diffs.push((currP.paperNav / prevP.paperNav - 1) / span - (currO / prevO - 1) / span);
  }

  const first = sortedPaper[0] as PaperForwardCheckpoint;
  const last = sortedPaper[sortedPaper.length - 1] as PaperForwardCheckpoint;
  const lastOracle = oracleByDay.get(last.dayIndex) as number;
  const maeDaily = diffs.length > 0 ? diffs.reduce((s, d) => s + Math.abs(d), 0) / diffs.length : 0;
  return {
    validAlignment: true,
    alignmentError: '',
    elapsedDays: Math.max(0, last.dayIndex - first.dayIndex),
    checkpointLedgerBreaches,
    dailyReturnDiffs: diffs,
    maeMonthlyBps: Number((maeDaily * DAYS_PER_MONTH * BPS_MULTIPLIER).toFixed(4)),
    rmseMonthlyBps: Number((computeStdDev(diffs) * Math.sqrt(DAYS_PER_MONTH) * BPS_MULTIPLIER).toFixed(4)),
    terminalNavDiscrepancyBps: Number(((Math.abs(last.paperNav - lastOracle) / lastOracle) * BPS_MULTIPLIER).toFixed(4)),
  };
}

function buildReport(
  verdict: G13Verdict,
  autoKillTriggered: boolean,
  reason: string,
  stats: ReturnSeriesStats,
  cfg: { minRequiredDays: number; targetDays: number; maxTe: number; te: number; ledgerBreaches: number; protViolations: number },
): TrackingErrorReconciliationReport {
  return {
    verdict,
    g13Pass: verdict === 'PASS',
    liveTradingUnlocked: false,
    autoKillTriggered,
    elapsedDays: stats.elapsedDays,
    minRequiredDays: cfg.minRequiredDays,
    targetDays: cfg.targetDays,
    maxTrackingErrorBpsPerMonth: cfg.maxTe,
    trackingErrorBpsPerMonth: cfg.te,
    maeMonthlyBps: stats.maeMonthlyBps,
    rmseMonthlyBps: stats.rmseMonthlyBps,
    terminalNavDiscrepancyBps: stats.terminalNavDiscrepancyBps,
    dailyReturnDiffs: stats.dailyReturnDiffs,
    ledgerBreachCount: cfg.ledgerBreaches,
    protectionViolationCount: cfg.protViolations,
    reason,
  };
}

export function evaluateG13Gate(input: EvaluateG13GateInput): TrackingErrorReconciliationReport {
  const minRequiredDays = Math.max(DEFAULT_G13_MIN_REQUIRED_DAYS, Math.trunc(input.minRequiredDays ?? DEFAULT_G13_MIN_REQUIRED_DAYS));
  const targetDays = Math.max(minRequiredDays, Math.trunc(input.targetDays ?? DEFAULT_G13_TARGET_DAYS));
  const maxTe = Math.min(DEFAULT_MAX_TRACKING_ERROR_BPS_PER_MONTH, Math.max(0.1, input.maxTrackingErrorBpsPerMonth ?? DEFAULT_MAX_TRACKING_ERROR_BPS_PER_MONTH));
  const autoKillBps = input.autoKillBpsPerMonth ?? DEFAULT_AUTO_KILL_BPS_PER_MONTH;

  const stats = alignAndComputeReturnDiffs(input.paperCheckpoints, input.oracleCheckpoints);
  const ledgerBreaches = (input.ledgerBreachCount ?? 0) + stats.checkpointLedgerBreaches;
  const protViolations = input.protectionViolationCount ?? 0;
  const te = Number(Math.max(stats.maeMonthlyBps, stats.rmseMonthlyBps).toFixed(4));
  const cfg = { minRequiredDays, targetDays, maxTe, te, ledgerBreaches, protViolations };

  if (!stats.validAlignment) {
    return buildReport('FAIL', true, stats.alignmentError, stats, cfg);
  }
  if (ledgerBreaches > 0 || protViolations > 0) {
    return buildReport('FAIL', true, `Hard safety breach (ledgerBreaches=${ledgerBreaches}, protectionViolations=${protViolations})`, stats, cfg);
  }
  const autoKill = te >= autoKillBps;
  if (stats.elapsedDays < minRequiredDays) {
    return buildReport('INCONCLUSIVE', autoKill, `Observation window underpowered (${stats.elapsedDays}d < ${minRequiredDays}d required); G15 live trading remains HARD-LOCKED`, stats, cfg);
  }
  if (te >= maxTe) {
    return buildReport('FAIL', autoKill, `Monthly tracking error ${te} bps/mo >= ${maxTe} bps/mo limit`, stats, cfg);
  }
  return buildReport('PASS', false, `G13 paper-forward passed (${stats.elapsedDays}d >= ${minRequiredDays}d, TE=${te} bps/mo < ${maxTe}); Gate G15 remains HARD-LOCKED pending human owner review`, stats, cfg);
}

export class TrackingErrorReconciler {
  private readonly defaults: Omit<EvaluateG13GateInput, 'paperCheckpoints' | 'oracleCheckpoints'>;

  public constructor(options: Omit<EvaluateG13GateInput, 'paperCheckpoints' | 'oracleCheckpoints'> = {}) {
    this.defaults = options;
  }

  public reconcile(
    paperCheckpoints: readonly PaperForwardCheckpoint[],
    oracleCheckpoints: readonly OracleReplayCheckpoint[],
    breaches?: { readonly ledgerBreachCount?: number; readonly protectionViolationCount?: number },
  ): TrackingErrorReconciliationReport {
    return evaluateG13Gate({ ...this.defaults, ...breaches, paperCheckpoints, oracleCheckpoints });
  }
}

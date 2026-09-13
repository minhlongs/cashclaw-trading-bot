// Killswitch pure risk evaluator & drawdown calculations
// Pure mathematical rules for circuit breaker decisions — 0 I/O, 0 dependencies

export interface OrderEvaluationResult {
  dailyPnl: number;
  consecutiveLosses: number;
  currentDrawdown: number;
  haltReason: string | null;
}

export interface EvaluatorStateInput {
  dailyPnl: number;
  consecutiveLosses: number;
  peakCapital: number;
  currentDrawdown: number;
}

export interface EvaluatorConfigInput {
  maxDailyLossPct: number;
  maxConsecutiveLosses: number;
  maxDrawdownPct: number;
}

export function computeDrawdown(peakCapital: number, capital: number): number {
  if (peakCapital <= 0) return 0;
  return Math.abs(((peakCapital - capital) / peakCapital) * 100);
}

export function evaluateConsecutiveLosses(consecutiveLosses: number, maxAllowed: number): string | null {
  if (consecutiveLosses >= maxAllowed) {
    return `Max consecutive losses reached: ${consecutiveLosses}`;
  }
  return null;
}

export function evaluateDailyPnl(dailyPnl: number, peakCapital: number, maxDailyLossPct: number): string | null {
  if (peakCapital > 0 && dailyPnl < 0) {
    const dailyPnlPct = Math.abs(dailyPnl / peakCapital) * 100;
    if (dailyPnlPct >= maxDailyLossPct) {
      return `Daily loss limit exceeded: ${dailyPnlPct.toFixed(1)}%`;
    }
  }
  return null;
}

export function evaluateOrderRisk(
  state: EvaluatorStateInput,
  pnl: number,
  config: EvaluatorConfigInput
): OrderEvaluationResult {
  const dailyPnl = state.dailyPnl + pnl;
  const consecutiveLosses = pnl < 0 ? state.consecutiveLosses + 1 : 0;
  let currentDrawdown = state.currentDrawdown;

  if (pnl < 0) {
    const lossHalt = evaluateConsecutiveLosses(consecutiveLosses, config.maxConsecutiveLosses);
    if (lossHalt) {
      return { dailyPnl, consecutiveLosses, currentDrawdown, haltReason: lossHalt };
    }
  }

  if (state.peakCapital > 0) {
    const dailyHalt = evaluateDailyPnl(dailyPnl, state.peakCapital, config.maxDailyLossPct);
    if (dailyHalt) {
      return { dailyPnl, consecutiveLosses, currentDrawdown, haltReason: dailyHalt };
    }
    const cur = state.peakCapital + dailyPnl;
    currentDrawdown = ((state.peakCapital - cur) / state.peakCapital) * 100;
    if (currentDrawdown >= config.maxDrawdownPct) {
      return {
        dailyPnl,
        consecutiveLosses,
        currentDrawdown,
        haltReason: `Max drawdown reached: ${currentDrawdown.toFixed(2)}%`,
      };
    }
  }

  return { dailyPnl, consecutiveLosses, currentDrawdown, haltReason: null };
}

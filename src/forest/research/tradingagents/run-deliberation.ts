// Top-level Deliberation Seam — ResearchGoal → DeliberationReport.
// Orchestrates: debate → hypotheses → CashClaw compile → risk advisory →
// portfolio advisory → decision log. PAPER/BACKTEST ONLY: no order
// placement, no promotion mutation. All data inputs are injected.

export type {
  RunDeliberationConfig,
  RunDeliberationResult,
} from './run-deliberation.types';
export {
  runDeliberation,
} from './run-deliberation.core';

// Strategy Promotion State Machine — facade re-exporting types and logic.

export type {
  StrategyPhase,
  GatePassed,
  GateFailed,
  ManualApproval,
  Promote,
  Demote,
  TransitionTrigger,
  TransitionResult,
} from './promotion-states-types';
export { AUTOMATED_CEILING } from './promotion-states-types';
export {
  isTerminalPhase,
  canTransition,
  getTransition,
  transitionStrategy,
  gateResultToTrigger,
} from './promotion-states-machine';

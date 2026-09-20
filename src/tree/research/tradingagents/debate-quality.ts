// Debate quality harness — compares deliberation arms (task §J):
//   A = single analyst, B = bull-bear debate,
//   C = debate + research manager, D = debate + CashClaw validation.
// Pure math only. Core law: multi-agent is NOT assumed better. If debate
// arms do not improve out-of-sample evidence quality or research
// efficiency over the single-analyst baseline, the verdict is REDUCE or
// DISABLE — never a silent keep.

export {
  DEBATE_ARMS,
  DEFAULT_DEBATE_QUALITY_CONFIG,
} from './debate-quality-types';
export type {
  DebateArm,
  DebateArmMetrics,
  DebateQualityConfig,
  ArmVerdict,
  DebateQualityReport,
  DebateQualityResult,
} from './debate-quality-types';
export type { DebateVerdict } from './types';
export { relativeImprovement, compareDebateArms } from './debate-quality-compare';

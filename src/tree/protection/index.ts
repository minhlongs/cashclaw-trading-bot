/**
 * Public barrel for deterministic fail-closed CapitalProtectionEngine
 * and adversarial tail-stress verification suite.
 */

export { CapitalProtectionEngine } from './capital-protection-engine';
export {
  AtomicFillDeduplicator,
  DeterministicLeaseCoordinator,
  ExecutionBudgetGuard,
  type BatchDeduplicationResult,
  type FillWebhookEvent,
  type LeaseGrantResult,
} from './execution-fences';
export {
  evaluateCollateralPeg,
  evaluateLedgerAccounting,
  evaluateVenueDislocation,
  validateOwnerOverride,
  type CollateralPegResult,
  type LedgerCheckResult,
  type OwnerOverrideValidation,
  type VenueDislocationResult,
} from './ledger-and-override-guards';
export {
  evaluateBrokenPairLeg,
  evaluateRebalanceHysteresis,
  simulateFundingFlipCarry,
  type BrokenPairLegDecision,
  type BrokenPairLegInput,
  type FundingCashflowEntry,
} from './pair-and-rebalance-fences';
export { evaluateConcentrationBetaAndLeverage } from './portfolio-exposure-guards';
export {
  evaluateMarketDataFreshness,
  evaluateOrderNumericAndNotional,
  evaluateVolatilityAndSpreadGate,
  type GuardCheckFailure,
} from './pretrade-numeric-and-staleness-guards';
export { DEFAULT_PROTECTION_CONFIG, resolveProtectionConfig } from './protection-config';
export type {
   ProtectionEngineStateSnapshot,
  StrategyCooldownEntry,
  SymbolSlippageEntry,
} from './protection-state-tracker';
export type {
  CollateralPriceSample,
  GlobalKillSwitchMode,
  LedgerSnapshot,
  MarketMicrostructureSnapshot,
  OwnerOverrideToken,
  PendingOrderFenceEntry,
  PositionExposure,
  PreTradeOrderCandidate,
  ProtectionActionCode,
  ProtectionDecision,
  ProtectionEngineConfig,
  ProtectionPosture,
  ProtectionTickContext,
  TwapSliceIntent,
  UnwindStage,
  VenuePriceSample,
} from './protection-types';
export {
  makeStressContext,
  makeStressMarket,
  makeStressOrder,
  makeStressPosition,
  STRESS_BASE_TIMESTAMP_MS,
} from './tail-stress-fixtures';
export {
  canonicalJson,
  computeCorrelationConvergenceScale,
  computeStressedCvar99Pct,
  DeterministicPrng,
  sha256HexSync,
  simulateHonestGapStopFill,
} from './tail-stress-math';
export {
  buildTailStressSummary,
  DEFAULT_STRESS_SEED,
  DETERMINISTIC_GENERATED_AT,
  runTailStressSuite,
} from './tail-stress-runner';
export type {
  TailStressMatrixArtifact,
  TailStressScenarioMetrics,
  TailStressSummary,
} from './tail-stress-types';
export { buildReduceOnlyTwapPlan, isBookSafeForTwap, type TwapUnwindPlan } from './twap-unwind-planner';

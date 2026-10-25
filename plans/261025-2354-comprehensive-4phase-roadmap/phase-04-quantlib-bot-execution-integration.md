# Phase 4: QuantLib Bot Execution & Toxicity Guard Integration

## Context & Objective
Connect `@cashclaw/quantlib` (`computeAlmgrenChrissTrajectory`) and `evaluateVpinThrottling` into the paper bot order execution seam (`src/tree/bot/strategies/volatility-dca-execution.ts` and `src/tree/bot/strategies/quantlib-execution-sizer.ts`) while maintaining 100% backward compatibility with existing tests and strict ADR-001 paper-only compliance.

## Files Owned
- `src/tree/bot/strategies/quantlib-execution-sizer.ts` (create <= 85 LOC)
- `src/tree/bot/strategies/volatility-dca-execution.ts` (modify <= 60 LOC)
- `src/tree/bot/strategies/quantlib-execution-sizer.test.ts` (create <= 140 LOC)

## Steps
1. Create `src/tree/bot/strategies/quantlib-execution-sizer.ts` exposing `computeQuantExecutionPlan` which combines `computeAlmgrenChrissTrajectory` (`src/tree/quantlib/execution/almgren-chriss-trajectory.ts`) and `evaluateVpinThrottling` (`src/tree/execution/almgren-chriss/vpin-execution-throttler.ts`) to compute optimal slice sizing, urgency kappa, strategy class, and toxicity throttling.
2. Integrate `computeQuantExecutionPlan` into `src/tree/bot/strategies/volatility-dca-execution.ts` (invoked when optional `quantExecution` parameters are supplied or via `executeQuantDcaOrder`), preserving exact default behavior of `executeDcaOrder` for all existing callers.
3. Create `src/tree/bot/strategies/quantlib-execution-sizer.test.ts` covering normal trajectory, TWAP fallback, VPIN toxicity throttling (`vpinCdf >= 0.85` and `>= 0.95`), and paper order execution with 100% statement/branch/function/line coverage.

## Validation
- `npx vitest run src/tree/bot/strategies/ --coverage` achieves 100% coverage on touched strategy files.
- Zero live exchange calls (ADR-001).

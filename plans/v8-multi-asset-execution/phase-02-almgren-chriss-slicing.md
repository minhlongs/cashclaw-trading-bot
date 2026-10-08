---
title: "Phase 2: Closed-Form Almgren-Chriss Optimal Order Slicing Engine"
description: "Deterministic execution trajectory minimizing market impact coupled with continuous VPIN toxicity throttling"
status: completed
priority: P1
effort: 2h
branch: main
tags: [trading, quant, v8, execution, almgren-chriss, vpin, optimal-slicing]
created: 2026-10-08
---

# Phase 2: Closed-Form Almgren-Chriss Optimal Order Slicing Engine

## Context Links
- Master Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/v8-architecture-deep-brainstorm.md`
- Continuous VPIN Streamer: `src/tree/quantlib/toxicity/continuous-vpin-streamer.ts:8`
- SLR Passive Execution Router: `src/tree/execution/slr/passive-execution-router.ts:10`
- Smart Order Router: `src/tree/execution/smart/sor-router.ts:4`

## Overview
- Priority: High (P1)
- Current Status: Pending
- Description: Implements a closed-form deterministic Almgren-Chriss optimal execution engine that calculates the optimal trade schedule to minimize expected transaction costs (market impact) and inventory risk. Dynamically throttles trajectory pace using real-time Continuous VPIN flow toxicity metrics, avoiding non-deterministic black-box reinforcement learning models while providing microsecond execution on edge runtimes.

## Key Insights
- The classic Almgren-Chriss (2000) framework provides an analytical closed-form solution using hyperbolic functions (sinh, cosh).
- Slicing trajectory parameter kappa = sqrt(lambda * sigma^2 / eta) balances market impact eta against volatility risk lambda * sigma^2.
- Coupling closed-form trajectory calculation with Continuous VPIN (from `src/tree/quantlib/toxicity/continuous-vpin-streamer.ts:19`) detects informed flow surges; when toxicity CDF > 0.80, the engine dynamically dilates the remaining execution horizon or shifts aggressive taker slices to passive maker limit orders.

## Requirements
- Functional Requirements:
  - Calculate discrete Almgren-Chriss trajectory slices given initial inventory X0, horizon T, time step tau, risk aversion lambda, volatility sigma, and temporary impact eta.
  - Integrate real-time VPIN metrics (`ContinuousVpinState`) to compute toxicity penalty factor and urgency adaptation.
  - Generate complete execution schedule with timestamps, planned trade sizes, remaining inventory, and recommended order type (taker vs. passive limit).
  - Handle edge cases: zero risk aversion (linear TWAP benchmark), extreme toxicity (execution pause), and single-step immediate execution.
- Non-Functional Requirements:
  - Zero `:any` types in TypeScript definitions.
  - All source files <= 200 lines (target <= 130 LOC).
  - Pure deterministic math using native Math functions (Math.sinh, Math.cosh, Math.exp), zero external dependencies.
  - 100% test coverage across statement, branch, function, and line metrics.

## Architecture
- Data Ingress: `AlmgrenChrissParameters` (X0, T, numIntervals, lambda, sigma, eta) and `ContinuousVpinState`.
- Transformation Pipeline:
  1. `almgren-chriss-trajectory.ts`: Evaluates kappa and computes deterministic hyperbolic trajectory points x_j and slice quantities n_j.
  2. `vpin-execution-throttler.ts`: Takes VPIN threshold CDF and computes toxicity urgency multiplier gamma_toxic and throttled horizon T_adj.
  3. `optimal-slice-coordinator.ts`: Synthesizes final actionable order schedule, determining aggressive vs. passive order flags.
- Data Egress: `AlmgrenChrissSchedule` containing slice array, expected impact cost, and total execution duration.

## Related Code Files
- Create: `src/tree/execution/almgren-chriss/almgren-chriss-types.ts`
- Create: `src/tree/execution/almgren-chriss/almgren-chriss-trajectory.ts`
- Create: `src/tree/execution/almgren-chriss/vpin-execution-throttler.ts`
- Create: `src/tree/execution/almgren-chriss/optimal-slice-coordinator.ts`
- Create: `src/tree/execution/almgren-chriss/almgren-chriss.test.ts`
- Modify: None (completely isolated directory `src/tree/execution/almgren-chriss/`)
- Delete: None

## Implementation Steps
1. Define interfaces in `src/tree/execution/almgren-chriss/almgren-chriss-types.ts`:
   - `AlmgrenChrissParams`, `ExecutionSlice`, `AlmgrenChrissSchedule`, `VpinThrottleConfig`, `ThrottleResult`.
2. Implement `src/tree/execution/almgren-chriss/almgren-chriss-trajectory.ts`:
   - Compute kappa = Math.sqrt((lambda * sigma^2) / eta).
   - Solve closed-form trajectory: x_j = X0 * sinh(kappa * (T - t_j)) / sinh(kappa * T).
   - Compute slice quantities: n_j = x_{j-1} - x_j.
   - Handle limit case kappa -> 0 (linear TWAP): n_j = X0 / N.
3. Implement `src/tree/execution/almgren-chriss/vpin-execution-throttler.ts`:
   - Evaluate `ContinuousVpinState` (`thresholdCdf`, `currentVpin`).
   - If `thresholdCdf >= 0.85`, pause execution or expand horizon T by factor (1 + 2 * (cdf - 0.85)).
   - Emit order execution preference: 'aggressive_market' vs 'passive_maker'.
4. Implement `src/tree/execution/almgren-chriss/optimal-slice-coordinator.ts`:
   - Coordinate throttled parameters and trajectory calculations.
   - Assemble executable slice sequence with timestamps and expected market impact cost.
5. Create comprehensive test suite `src/tree/execution/almgren-chriss/almgren-chriss.test.ts`:
   - Verify sum of all slices equals total inventory X0 exactly (mass conservation invariant).
   - Verify high risk aversion produces front-loaded execution trajectories.
   - Verify zero risk aversion reproduces uniform TWAP slicing.
   - Verify VPIN toxicity spike slows schedule and flags passive maker routing.
   - Validate 100% test coverage.

## Todo List
- [ ] Create `almgren-chriss-types.ts` with strict execution types
- [ ] Implement `almgren-chriss-trajectory.ts` with closed-form hyperbolic formulas
- [ ] Implement `vpin-execution-throttler.ts` integrating VPIN state
- [ ] Implement `optimal-slice-coordinator.ts` orchestrating dynamic schedule
- [ ] Write unit tests in `almgren-chriss.test.ts` covering all invariants and edge cases
- [ ] Verify test suite passes with 100% coverage and 0 lint warnings

## Success Criteria
- Trajectory mass conservation: sum(slice.quantity) === initialInventory within 1e-8.
- Monotonicity: Remaining inventory strictly decreases from X0 to 0.
- VPIN responsiveness: Elevation of VPIN CDF above 0.85 automatically lengthens execution duration or switches order flags to passive.
- All 5 files satisfy <= 200 LOC constraint (target <= 130 LOC).
- 100% test coverage achieved with vitest.

## Risk Assessment
- Risk: Overflow/underflow in Math.sinh or Math.cosh when kappa * T is large.
  - Likelihood: Low | Impact: High
  - Mitigation: Bound kappa * T <= 50; for kappa * T > 50, use asymptotic exponential approximation exp(-kappa * t_j).
- Risk: Slices rounding to sub-satoshi quantities.
  - Likelihood: Low | Impact: Medium
  - Mitigation: Enforce minimum lot size quantization and rollover remainder to final slice.

## Backwards Compatibility and Rollback Plan
- Backwards Compatibility: Additive engine in `src/tree/execution/almgren-chriss/`. Does not modify existing SOR router or SLR router.
- Rollback Plan: Delete `src/tree/execution/almgren-chriss/` directory without affecting any existing code.

## Test Matrix
- Unit Tests:
  - `almgren-chriss-trajectory`: Conservation of total volume, TWAP limit when lambda = 0, aggressive decay when lambda is high, numerical stability with large kappa.
  - `vpin-execution-throttler`: Normal toxicity pass-through, moderate toxicity throttling, extreme toxicity execution pause.
  - `optimal-slice-coordinator`: Full schedule generation, timestamp sequencing, minimum lot size rounding.
- Integration Test:
  - Feed simulated VPIN stream into coordinator and verify trajectory dynamically adapts without throwing.

## Security Considerations
- Read-only algorithmic calculations; no trade execution keys or account state accessed directly.
- All numeric parameters guarded against negative values, NaN, and division by zero.

## Next Steps
- Execute Phase 2 implementation in parallel with Phase 1 and Phase 3.

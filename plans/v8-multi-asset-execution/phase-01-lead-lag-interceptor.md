---
title: "Phase 1: Cross-Asset Lead-Lag Matrix & Microstructure Latency Interceptor"
description: "Online tick cross-correlation and Granger causality engine for lead-lag alpha and reservation price adjustments"
status: completed
priority: P1
effort: 2h
branch: main
tags: [trading, quant, v8, lead-lag, granger, microstructure]
created: 2026-10-08
---

# Phase 1: Cross-Asset Lead-Lag Matrix & Microstructure Latency Interceptor

## Context Links
- Master Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/v8-architecture-deep-brainstorm.md`
- Toxicity Reference: `src/tree/quantlib/toxicity/continuous-vpin-streamer.ts:8`
- SLR Router Reference: `src/tree/execution/slr/passive-execution-router.ts:10`
- Kalman Online Estimator: `src/tree/quantlib/statarb/kalman-filter-hedge.ts:9`

## Overview
- Priority: High (P1)
- Current Status: Pending
- Description: Implements a streaming cross-asset lead-lag matrix and microstructure latency interceptor. Detects when a lead asset (e.g. BTCUSDT) makes directional price movements that propagate with lag tau to follower assets (e.g. ETHUSDT, SOLUSDT). Computes real-time cross-correlation and bivariate Granger F-statistics over sliding tick windows, providing analytical drift offsets to reservation prices before follower exchange order books adjust.

## Key Insights
- High-frequency cross-asset price propagation in crypto exhibits 5ms to 500ms lag across venue books and correlated pairs.
- By continuously estimating the sign and magnitude of cross-correlation at discrete lag offsets tau in [1, K], the engine detects which asset is leading.
- Closed-form exponential kernels avoid batch matrix inversions, enabling single-microsecond edge-runtime updates without ML runtime overhead.

## Requirements
- Functional Requirements:
  - Track rolling tick returns for N configured symbols simultaneously.
  - Calculate online cross-correlation rho(tau) for lag horizons tau in [1, 5] ticks.
  - Compute directional Granger causality score (F-stat proxy) indicating leadership probability and lead confidence [0, 1].
  - Provide `interceptMicrostructureLatency` function returning adjusted reservation price and recommended quote shift in basis points.
- Non-Functional Requirements:
  - Strict TypeScript with zero `:any` types.
  - All source files <= 200 lines (target <= 130 LOC).
  - Pure deterministic math, zero I/O, zero `console.log`.
  - 100% test coverage across statement, branch, function, and line metrics.

## Architecture
- Data Ingress: Raw tick events `{ symbol: string, price: number, timestampMs: number }`.
- Transformation Pipeline:
  1. `tick-cross-correlator.ts`: Updates online exponential variance and lagged covariance buffers.
  2. `granger-lead-lag-matrix.ts`: Computes pairwise asymmetric variance reduction and Granger directionality score.
  3. `microstructure-latency-interceptor.ts`: Translates leading return momentum and follower sensitivity into reservation price drift offsets.
- Data Egress: `LeadLagInterceptResult` containing leadership pair, lag offset, drift bps, and reservation price recommendation.

## Related Code Files
- Create: `src/tree/quantlib/leadlag/lead-lag-types.ts`
- Create: `src/tree/quantlib/leadlag/tick-cross-correlator.ts`
- Create: `src/tree/quantlib/leadlag/granger-lead-lag-matrix.ts`
- Create: `src/tree/quantlib/leadlag/microstructure-latency-interceptor.ts`
- Create: `src/tree/quantlib/leadlag/lead-lag.test.ts`
- Modify: None (completely isolated directory `src/tree/quantlib/leadlag/`)
- Delete: None

## Implementation Steps
1. Define interfaces in `src/tree/quantlib/leadlag/lead-lag-types.ts`:
   - `TickEvent`, `CrossCorrelationState`, `GrangerScore`, `LeadLagInterceptResult`, `LeadLagConfig`.
2. Implement `src/tree/quantlib/leadlag/tick-cross-correlator.ts`:
   - State initialization: `initializeCrossCorrelationState(symbols, maxLag)`.
   - Update function: `updateTickCrossCorrelation(state, tick, config)`.
   - Online exponential moving covariance calculation across lag horizon.
3. Implement `src/tree/quantlib/leadlag/granger-lead-lag-matrix.ts`:
   - Bivariate autoregressive residual variance evaluation.
   - Directed causality score: `computeGrangerLeadLagMatrix(state)`.
4. Implement `src/tree/quantlib/leadlag/microstructure-latency-interceptor.ts`:
   - Latency interceptor: `interceptMicrostructureLatency(followerSymbol, currentMidPrice, leadLagMatrix, recentTicks)`.
   - Calculate drift in bps and bounded reservation price adjustment.
5. Create comprehensive test suite `src/tree/quantlib/leadlag/lead-lag.test.ts`:
   - Unit test synthetic leading pulse signals propagating to follower with known lag.
   - Test zero-variance and noisy input guards.
   - Validate 100% test coverage.

## Todo List
- [ ] Create `lead-lag-types.ts` with strict interfaces
- [ ] Implement `tick-cross-correlator.ts` with exponential kernel
- [ ] Implement `granger-lead-lag-matrix.ts` with directional causality
- [ ] Implement `microstructure-latency-interceptor.ts` with price adjuster
- [ ] Write unit tests in `lead-lag.test.ts` covering all edge cases
- [ ] Verify test suite passes with 100% coverage and 0 lint warnings

## Success Criteria
- Deterministic detection: A synthetic leader tick jump of +1.0% identifies leader with score > 0.8 within 3 ticks.
- Latency interceptor generates positive reservation price drift for follower before follower ticks catch up.
- All 5 files satisfy <= 200 LOC constraint (target <= 130 LOC).
- 100% test coverage achieved with vitest.

## Risk Assessment
- Risk: Floating point round-off in online exponential covariance leading to correlation outside [-1, 1].
  - Likelihood: Medium | Impact: High
  - Mitigation: Enforce strict clamping `Math.max(-1, Math.min(1, rho))` and epsilon guards on denominator variance.
- Risk: Asynchronous tick arrival skewing lag index.
  - Likelihood: Low | Impact: Medium
  - Mitigation: Window ticks by monotonic sequence counter and timestampMs delta bucketing.

## Backwards Compatibility and Rollback Plan
- Backwards Compatibility: This module is purely additive in `src/tree/quantlib/leadlag/`. No existing functions or interfaces are altered.
- Rollback Plan: Delete `src/tree/quantlib/leadlag/` directory; zero impact on existing bot operations or tests.

## Test Matrix
- Unit Tests:
  - `tick-cross-correlator`: Initialization, single tick update, identical series (rho = 1), anti-correlated series (rho = -1).
  - `granger-lead-lag-matrix`: Directed matrix asymmetry, noise independence (score approx 0), strong leadership (score > 0.8).
  - `microstructure-latency-interceptor`: Reservation price upward drift on leader surge, downward drift on leader drop, clamp bounds on extreme moves.
- Integration Test:
  - End-to-end multi-asset tick stream simulation verifying follower reservation price adapts prior to follower market tick.

## Security Considerations
- Pure mathematical functions running in-memory with zero I/O and zero credential access.
- All numerical inputs validated against NaN and Infinity.

## Next Steps
- Execute Phase 1 implementation in parallel with Phase 2 and Phase 3.

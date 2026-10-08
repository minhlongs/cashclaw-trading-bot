---
title: "Phase 5: Multivariate Johansen Cointegration & Internal Crossing Network"
description: "Multivariable cointegration testing across crypto assets and internal bot-to-bot liquidity crossing netting"
status: pending
priority: P1
effort: 1.5h
branch: main
tags: [quant, stat-arb, johansen, cointegration, crossing-network, dark-pool]
created: 2026-10-08
---

# Phase 5: Multivariate Johansen Cointegration & Internal Crossing Network

## Overview
Implements multivariate Johansen cointegration analysis (eigenvalue decomposition on lagged variance matrices) to discover stationary linear combinations across multiple crypto pairs simultaneously. Pairs this with an Internal Crossing Network that nets opposing bot orders in memory before sending residuals to external exchanges, capturing the full bid-ask spread and reducing taker fees to 0.

## Related Code Files
- Create: `src/tree/quantlib/statarb/johansen-types.ts`
- Create: `src/tree/quantlib/statarb/johansen-cointegration.ts`
- Create: `src/tree/execution/crossing/internal-crossing-types.ts`
- Create: `src/tree/execution/crossing/internal-crossing-network.ts`
- Create: `src/tree/quantlib/statarb/johansen-crossing.test.ts`

## Key Requirements
- Analytical 2-asset and 3-asset eigenvalue extraction with asymptotic critical value lookups.
- Strict mass and value conservation on internal order matching.
- Files $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage.

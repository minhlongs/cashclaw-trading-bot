---
title: "Phase 4: Guéant-Tapia-Manziadi Optimal Market Making & OFI Alpha Engine"
description: "Closed-form HJB optimal market making with inventory penalty and Order Flow Imbalance (OFI) alpha"
status: pending
priority: P1
effort: 1.5h
branch: main
tags: [quant, market-making, gueant-tapia-manziadi, ofi, microstructure]
created: 2026-10-08
---

# Phase 4: Guéant-Tapia-Manziadi Optimal Market Making & OFI Alpha Engine

## Overview
Implements the closed-form Guéant-Tapia-Manziadi (2012) optimal market making model for continuous quote placement with quadratic inventory holding penalty. Couples quote spreads with multiscale Order Flow Imbalance (OFI) to dynamically skew quotes and avoid adverse selection.

## Related Code Files
- Create: `src/tree/quantlib/marketmaking/gtm-types.ts`
- Create: `src/tree/quantlib/marketmaking/gtm-engine.ts`
- Create: `src/tree/quantlib/marketmaking/ofi-engine.ts`
- Create: `src/tree/quantlib/marketmaking/gtm-market-making.test.ts`

## Key Requirements
- Pure deterministic math (Math.log, Math.sqrt, Math.exp), zero external dependencies.
- Monotonicity checks: positive inventory skews quotes downward to liquidate inventory.
- Files $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage.

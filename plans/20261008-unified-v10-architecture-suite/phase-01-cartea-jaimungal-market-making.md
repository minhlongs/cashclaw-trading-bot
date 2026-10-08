# Phase 1: Cartea-Jaimungal (2014) Alpha-Informed Market Making Desk

## Context Links
- Plan: [plan.md](./plan.md)
- Architecture Spec: `docs/unified-v10-architecture-spec.md`
- Brainstorming Report: `docs/brainstorming-unified-v10-architecture.md`

## Overview
- **Priority**: High
- **Status**: pending
- **Effort**: 1.5h
- **Target Files**:
  - `src/tree/quantlib/marketmaking/cartea-jaimungal-types.ts`
  - `src/tree/quantlib/marketmaking/cartea-jaimungal-engine.ts`
  - `src/tree/quantlib/marketmaking/cartea-jaimungal-engine.test.ts`

## Key Insights & Mathematical Model
The Cartea-Jaimungal (2014) optimal quoting model integrates an asset price drift $\alpha_t$ (short-term alpha from OFI, micro-price momentum, or order flow signals) directly into the market maker's value function:
$$dS_t = \alpha_t dt + \sigma dW_t$$

Optimal bid and ask depths from mid-price $S_t$:
$$\delta^{b*}(q, \alpha) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) + \frac{2q + 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}} - \frac{\alpha}{\kappa}$$
$$\delta^{a*}(q, \alpha) = \frac{1}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right) - \frac{2q - 1}{2} \sqrt{\frac{\gamma \sigma^2}{2 \kappa A} \left(1 + \frac{\gamma}{\kappa}\right)^{\frac{\kappa}{\gamma} + 1}} + \frac{\alpha}{\kappa}$$

When drift $\alpha > 0$:
- Bid spread narrows ($-\alpha/\kappa$) to capture incoming buyer sweeps and build inventory.
- Ask spread widens ($+\alpha/\kappa$) to avoid adverse selection from toxic sweeps.

## Requirements
- Support configurable parameters: `riskAversion` ($\gamma$), `orderArrivalIntensity` ($A$), `decayExponent` ($\kappa$), `volatility` ($\sigma$).
- Input: `inventory` ($q$), `midPrice` ($S$), `alphaDrift` ($\alpha$).
- Return quote depths ($\delta^b, \delta^a$), absolute quote prices ($P^b, P^a$), half-spread, and skew.
- Max lines per file $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage with mathematical invariant testing (symmetry when $\alpha=0, q=0$; skew responsiveness to $\pm\alpha$).

## Implementation Steps
1. Create `cartea-jaimungal-types.ts` with strongly-typed interfaces.
2. Implement `CarteaJaimungalEngine` in `cartea-jaimungal-engine.ts`.
3. Add unit test suite in `cartea-jaimungal-engine.test.ts` covering edge cases, bounds, and directional shifts.
4. Export through `src/tree/quantlib/index.ts`.

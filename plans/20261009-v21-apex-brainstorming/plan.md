# Implementation Plan: Triad v21 Apex Quantitative & Architecture Suite

## Context
Following user approval for the full Triad v21 Apex Suite scope ("Cả 3 trụ cột"), this plan specifies the implementation steps for:
1. **Avellaneda-Stoikov (2008) High-Frequency Optimal Quoting Engine** (`src/tree/quantlib/marketmaking/`).
2. **Easley-Kiefer-O'Hara-Paperman (EKOP 1996) Probability of Informed Trading (PIN) Engine** (`src/tree/quantlib/microstructure/`).
3. **Deep Modularization (< 70 LOC per file)** for `src/tree/alpha/labeling.ts` and `src/forest/alpha/gate/financial-checks.ts`.
4. **Comprehensive Unit & E2E Cross-Domain Simulation Testing** preserving 100% green tests (5,553+ tests), 0 `:any`, 0 ESLint warnings.

---

## Technical Specifications

### Pillar 1: Avellaneda-Stoikov (2008) Market Making Engine
- **Files**:
  - `src/tree/quantlib/marketmaking/avellaneda-stoikov-types.ts` (<= 25 LOC)
  - `src/tree/quantlib/marketmaking/avellaneda-stoikov-engine.ts` (<= 70 LOC)
- **Mathematical Formulations**:
  - Parameters: Mid-price $s$, inventory $q$, risk aversion $\gamma > 0$, volatility $\sigma > 0$, time horizon $T - t > 0$, order book intensity/liquidity parameter $\kappa > 0$.
  - Reservation Price: $r(s, q, t) = s - q \gamma \sigma^2 (T - t)$
  - Total Optimal Spread: $S^*(s, q, t) = \gamma \sigma^2 (T - t) + \frac{2}{\gamma} \ln\left(1 + \frac{\gamma}{\kappa}\right)$
  - Asymmetric Quote Offsets:
    $$\delta^a = \frac{S^*}{2} + \frac{s - r}{2} = \frac{S^*}{2} + \frac{q \gamma \sigma^2 (T - t)}{2}$$
    $$\delta^b = \frac{S^*}{2} - \frac{s - r}{2} = \frac{S^*}{2} - \frac{q \gamma \sigma^2 (T - t)}{2}$$
  - Optimal Bid: $P_{\text{bid}} = s - \delta^b$; Optimal Ask: $P_{\text{ask}} = s + \delta^a$.

### Pillar 2: EKOP (1996) PIN Microstructure Toxicity Engine
- **Files**:
  - `src/tree/quantlib/microstructure/ekop-pin-types.ts` (<= 25 LOC)
  - `src/tree/quantlib/microstructure/ekop-pin-engine.ts` (<= 70 LOC)
- **Mathematical Formulations**:
  - Trade observations with buyer-initiated count $B_t$ and seller-initiated count $S_t$ over intervals $t = 1 \dots N$.
  - Average buy trades $\bar{B}$, average sell trades $\bar{S}$.
  - Estimated uninformed noise rate $\hat{\epsilon} = \min(\bar{B}, \bar{S})$.
  - Estimated informed order arrival rate $\hat{\mu} = |\bar{B} - \bar{S}|$.
  - Event probability estimation $\hat{\alpha} = \min(1, \frac{\text{Var}(B - S)}{\bar{B} + \bar{S} + 1e-8})$.
  - Probability of Informed Trading (PIN):
    $$\text{PIN} = \frac{\hat{\alpha} \hat{\mu}}{\hat{\alpha} \hat{\mu} + 2 \hat{\epsilon}}$$
  - Bounded $\text{PIN} \in [0, 1]$. Higher PIN triggers liquidity withdrawal / wider quote spreads.

### Pillar 3: Deep File Modularization (< 70 LOC per file)
1. **`src/tree/alpha/labeling.ts`** (129 LOC):
   - Extract `labeling-barrier-evaluator.ts` (<= 60 LOC): Core candle forward scanner and barrier evaluation.
   - Refactor `labeling.ts` (<= 60 LOC): Lean facade orchestrating barrier labeling, types, and exports.
2. **`src/forest/alpha/gate/financial-checks.ts`** (136 LOC):
   - Extract `financial-checks-core.ts` (<= 60 LOC): `checkMinTrades`, `checkMinNetExpectancy`, `checkMinProfitFactor`, `checkMaxDrawdown`.
   - Refactor `financial-checks.ts` (<= 60 LOC): Lean facade housing `checkSharpeRatio`, `checkMaxConsecutiveLosses`, and regime checks.

### Pillar 4: Testing & Verification
- Unit test: `test/quant/avellaneda-stoikov-engine.test.ts`
- Unit test: `test/quant/ekop-pin-engine.test.ts`
- E2E Simulation: `test/quant/v21-apex-suite-simulation.test.ts`
- Full test pass: `npm test` & `npm run lint`

---

## Execution Steps
- [ ] 1. Create `avellaneda-stoikov-types.ts` and `avellaneda-stoikov-engine.ts`.
- [ ] 2. Create `ekop-pin-types.ts` and `ekop-pin-engine.ts`.
- [ ] 3. Modularize `labeling.ts` into `labeling-barrier-evaluator.ts` and lean facade.
- [ ] 4. Modularize `financial-checks.ts` into `financial-checks-core.ts` and lean facade.
- [ ] 5. Implement unit tests in `test/quant/`.
- [ ] 6. Implement E2E simulation test `test/quant/v21-apex-suite-simulation.test.ts`.
- [ ] 7. Run `npm run lint` and `npm test` to verify 100% green tests.
- [ ] 8. Update documentation (`docs/project-changelog.md`, `docs/development-roadmap.md`) and memory.

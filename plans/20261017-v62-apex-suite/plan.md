# Triad v62 Golden Apex Multi-Domain Quantitative & Architecture Suite

## Context & Objectives
Deliver the v62 Golden Apex Multi-Domain Quantitative & Architecture Suite in `/Users/macbook/trade-bot` with strict micro-modularization ($\le 35$ LOC per source file), zero `:any` types, zero ESLint warnings, and 100% test pass rate:

1. **Corwin & Schultz (2012) High-Low Bid-Ask Spread & Volatility Engine**:
   - `src/tree/quantlib/microstructure/corwin-schultz-types.ts`
   - `src/tree/quantlib/microstructure/corwin-schultz-estimator.ts`
   - `src/tree/quantlib/microstructure/corwin-schultz-engine.ts`
   - Estimates the effective bid-ask spread $S = \frac{2(e^\alpha - 1)}{1 + e^\alpha}$ and intrinsic high-low volatility from two-day high-low log price ranges ($\beta, \gamma \to \alpha$) with non-negative overnight spread clamping.

2. **Abdi & Ranaldo (2017) Close-High-Low (CHL) Effective Spread Engine**:
   - `src/tree/quantlib/microstructure/abdi-ranaldo-types.ts`
   - `src/tree/quantlib/microstructure/abdi-ranaldo-estimator.ts`
   - `src/tree/quantlib/microstructure/abdi-ranaldo-engine.ts`
   - Estimates effective bid-ask spread via two-day close-to-mid-range covariance $S_t = 2\sqrt{\max(0, (c_t - \eta_t)(c_t - \eta_{t+1}))}$ where $\eta_t = \frac{\ln H_t + \ln L_t}{2}$.

3. **Lesmond, Ogden & Trzcinka (1999) LOT Zero-Return Transaction Cost Engine**:
   - `src/tree/quantlib/liquidity/lesmond-lot-types.ts`
   - `src/tree/quantlib/liquidity/lesmond-lot-Engine.ts` (`lesmond-lot-engine.ts`)
   - Estimates the zero-return proportion (ZRP), effective round-trip transaction cost threshold ($\alpha_2 - \alpha_1$), and latent informed trading threshold from return series.

4. **Pástor & Stambaugh (2003) Volume-Induced Return Reversal Liquidity Engine**:
   - `src/tree/quantlib/liquidity/pastor-stambaugh-types.ts`
   - `src/tree/quantlib/liquidity/pastor-stambaugh-estimator.ts`
   - `src/tree/quantlib/liquidity/pastor-stambaugh-engine.ts`
   - Estimates the signed-volume return reversal coefficient $\gamma$ ($r^e_{t+1} = \theta + \phi r_t + \gamma \cdot \text{sign}(r^e_t) v_t + \epsilon_{t+1}$) measuring order-flow-induced temporary price impact and liquidity sensitivity.

5. **Deep Production Codebase Modularization ($\le 35$ LOC)**:
   - `src/tree/research/hypothesis/types.ts` (118 LOC) $\to$ decomposed into `hypothesis-contracts.ts`, `hypothesis-schema.ts`, `hypothesis-parser.ts`, and `types.ts` facade.
   - `src/tree/research/alpha/zoo/operator-kernels.ts` (117 LOC) $\to$ decomposed into `operator-kernels-moments.ts`, `operator-kernels-rank.ts`, `operator-kernels-transform.ts`, and `operator-kernels.ts` facade.

6. **Verification & Documentation**:
   - Unit tests in `test/quant/corwin-schultz.test.ts`, `test/quant/abdi-ranaldo.test.ts`, `test/quant/lesmond-lot.test.ts`, `test/quant/pastor-stambaugh.test.ts`, and `test/quant/v62-apex-suite-simulation.test.ts`.
   - Update `docs/development-roadmap.md` and `docs/project-changelog.md`.

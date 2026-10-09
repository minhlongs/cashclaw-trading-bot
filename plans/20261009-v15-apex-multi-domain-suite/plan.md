# Implementation Plan: v15 Apex Multi-Domain Quantitative & Architecture Suite

**Status:** In Progress  
**Target:** 100% green tests, 0 `:any`, 0 ESLint warnings, all touched files $\le 130$ LOC, build clean.

---

## Phases

### Phase 1: Pillar 1 — Kyle (1985) Adverse Selection Lambda Engine
- Create `src/tree/quantlib/microstructure/kyle-lambda-types.ts` ($\le 35$ LOC)
- Create `src/tree/quantlib/microstructure/kyle-lambda-engine.ts` ($\le 75$ LOC)
- Create `test/quant/kyle-lambda-engine.test.ts` ($\le 85$ LOC)

### Phase 2: Pillar 2 — Gatheral Rough Volatility Hurst Exponent Estimator
- Create `src/tree/quantlib/volatility/gatheral-rough-volatility-types.ts` ($\le 35$ LOC)
- Create `src/tree/quantlib/volatility/gatheral-rough-volatility.ts` ($\le 75$ LOC)
- Create `test/quant/gatheral-rough-volatility.test.ts` ($\le 85$ LOC)

### Phase 3: Pillar 3 — Structural Fat-File Modularization ($\le 130$ LOC)
- Modularize `src/forest/alpha/research-agent/mock-provider.ts` (167 $\rightarrow \le 120$ LOC) by extracting `mock-provider-fixtures.ts`
- Modularize `src/tree/alpha/observability/shadow-simulator.ts` (149 $\rightarrow \le 115$ LOC) by extracting `shadow-simulator-fills.ts`

### Phase 4: Integration Simulation & Global Quality Gate
- Create `test/quant/v15-apex-suite-simulation.test.ts` ($\le 95$ LOC)
- Run `npm test`, verify all $\ge 5,484$ tests pass
- Run `npx tsc --noEmit` and `npm run build`

### Phase 5: Documentation & Git Commit
- Update `docs/project-changelog.md`
- Update `docs/development-roadmap.md`
- Update memory and commit with conventional commit

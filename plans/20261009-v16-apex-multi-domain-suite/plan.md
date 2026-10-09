# Plan: Triad v16 Apex Multi-Domain Suite

## Context & Objectives
Triển khai bộ 3 giải pháp định lượng và tối ưu hóa cấu trúc kiến trúc mã nguồn v16:
1. **Pillar 1:** Amihud (2002) Illiquidity Ratio Engine trong `src/tree/quantlib/liquidity/`.
2. **Pillar 2:** Cont-de Larrard (2013) Markovian Queue First-Passage Engine trong `src/tree/quantlib/microstructure/`.
3. **Pillar 3:** Phân rã modular `schemas.ts` và `seam.ts` trong `src/forest/alpha/research-agent/` về $\le 120$ LOC.

## Phases

### Phase 1: Pillar 1 — Amihud (2002) Illiquidity Ratio Engine
- Create `src/tree/quantlib/liquidity/amihud-illiq-types.ts` ($\le 25$ LOC)
- Create `src/tree/quantlib/liquidity/amihud-illiq-engine.ts` ($\le 85$ LOC)
- Create `test/quant/amihud-illiq-engine.test.ts` ($\le 60$ LOC)

### Phase 2: Pillar 2 — Cont-de Larrard (2013) Markovian Queue Engine
- Create `src/tree/quantlib/microstructure/cont-delarrard-queue-types.ts` ($\le 25$ LOC)
- Create `src/tree/quantlib/microstructure/cont-delarrard-queue-engine.ts` ($\le 90$ LOC)
- Create `test/quant/cont-delarrard-queue-engine.test.ts` ($\le 60$ LOC)

### Phase 3: Pillar 3 — Structural Modularization of Research-Agent
- Extract `schemas-json-parser.ts` ($\le 35$ LOC) from `src/forest/alpha/research-agent/schemas.ts` ($\rightarrow \le 115$ LOC)
- Extract `seam-job-extractors.ts` ($\le 55$ LOC) from `src/forest/alpha/research-agent/seam.ts` ($\rightarrow \le 105$ LOC)
- Verify backward compatibility across all callers and existing tests.

### Phase 4: E2E Simulation & Quality Gate Verification
- Create `test/quant/v16-apex-suite-simulation.test.ts` ($\le 75$ LOC)
- Run `npm test`, `npx tsc --noEmit`, `npm run build`
- Update `docs/development-roadmap.md`, `docs/project-changelog.md`, and memory records.

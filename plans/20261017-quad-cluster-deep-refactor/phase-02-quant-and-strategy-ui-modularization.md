# Phase 02: Quant & Strategy Visualizer Modularization (`177–196 LOC` -> `<= 135 LOC`)

## Overview
- **Priority:** P0
- **Status:** Pending
- **Description:** Extract pure domain data and calculation helpers from the 6 largest UI components (`177–196 LOC`) so every component is `<= 135 LOC` and pure calculations are independently testable.

## Related Code Files
- Create: `src/components/quant/fdr-multiple-testing-model.ts`
- Modify: `src/components/quant/fdr-multiple-testing-gate.tsx` (`196 LOC` -> `<= 130 LOC`)
- Create: `src/components/quant/regime-attribution-model.ts`
- Modify: `src/components/quant/regime-attribution-simulator.tsx` (`191 LOC` -> `<= 130 LOC`)
- Create: `src/components/strategies/volatility-dca-walk-forward-table.tsx`
- Modify: `src/components/strategies/volatility-dca-visualizer.tsx` (`184 LOC` -> `<= 135 LOC`)
- Create: `src/components/quant/deliberation-theater-model.ts`
- Modify: `src/components/quant/deliberation-theater.tsx` (`182 LOC` -> `<= 130 LOC`)
- Create: `src/components/quant/alpha-zoo-evaluator-model.ts`
- Modify: `src/components/quant/alpha-zoo-evaluator.tsx` (`181 LOC` -> `<= 130 LOC`)
- Create: `src/components/quant/microstructure-liquidity-model.ts`
- Modify: `src/components/quant/microstructure-liquidity-analyzer.tsx` (`177 LOC` -> `<= 130 LOC`)

## Success Criteria
- All 6 components and their extracted model/table modules are strictly `<= 135 LOC`.
- All existing component tests pass without modification.

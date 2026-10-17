# Phase 02: Non-Test Hotspot Modularization (<= 131 LOC Ceiling)

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Decompose all 4 remaining non-test files above 140 LOC plus `dashboard-client.tsx` (132 LOC) so the maximum non-test file size across `src/` is `131 LOC`.

## Related Code Files
- Create: `src/components/quant/design-system-style-guide-model.ts`
- Modify: `src/components/quant/design-system-style-guide.tsx`
- Create: `src/components/quant/survival-gate-monitor-model.ts`
- Modify: `src/components/quant/survival-gate-monitor.tsx`
- Create: `src/components/dashboard/dashboard-data-mapper.ts`
- Modify: `src/components/dashboard/dashboard-client.tsx`
- Create: `src/tree/bot/__tests__/bot-manager-test-fixtures.ts`
- Modify: `src/tree/bot/__tests__/bot-manager-test-utils.ts`
- Create: `src/app/[locale]/backtests/__tests__/backtests-test-messages.ts`
- Modify: `src/app/[locale]/backtests/__tests__/backtests-test-helpers.tsx`

## Todo List
- [ ] Extract `design-system-style-guide-model.ts` and slim `design-system-style-guide.tsx` (`<= 115 LOC`).
- [ ] Extract `survival-gate-monitor-model.ts` and slim `survival-gate-monitor.tsx` (`<= 110 LOC`).
- [ ] Extract `dashboard-data-mapper.ts` and slim `dashboard-client.tsx` (`<= 95 LOC`).
- [ ] Extract `bot-manager-test-fixtures.ts` and re-export from `bot-manager-test-utils.ts` (`<= 95 LOC`).
- [ ] Extract `backtests-test-messages.ts` and re-export from `backtests-test-helpers.tsx` (`<= 105 LOC`).

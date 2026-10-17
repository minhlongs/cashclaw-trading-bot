# Phase 03: Test Monolith Slicing (< 240 LOC) & Verification

## Overview
- **Priority:** High
- **Status:** Pending
- **Description:** Slice the 4 remaining ~400 LOC test files (`scheduler.test.ts`, `bot-order-executor.test.ts`, `evaluator.test.ts`, `compiler.test.ts`) below `240 LOC` each and run full repo quality gates.

## Related Code Files
- Modify: `src/forest/bot/scheduler.test.ts` + Create: `src/forest/bot/scheduler-resilience.test.ts`
- Modify: `src/tree/bot/bot-order-executor.test.ts` + Create: `src/tree/bot/bot-order-executor-orchestrator.test.ts`
- Modify: `src/tree/alpha/hypothesis/evaluator.test.ts` + Create: `src/tree/alpha/hypothesis/evaluator-direction-rules.test.ts`
- Modify: `src/tree/research/alpha/compiler.test.ts` + Create: `src/tree/research/alpha/compiler-spec.test.ts`

## Todo List
- [ ] Split `scheduler.test.ts` (`410 LOC`) into `scheduler.test.ts` and `scheduler-resilience.test.ts`.
- [ ] Split `bot-order-executor.test.ts` (`401 LOC`) into `bot-order-executor.test.ts` and `bot-order-executor-orchestrator.test.ts`.
- [ ] Split `evaluator.test.ts` (`400 LOC`) into `evaluator.test.ts` and `evaluator-direction-rules.test.ts`.
- [ ] Split `compiler.test.ts` (`398 LOC`) into `compiler.test.ts` and `compiler-spec.test.ts`.
- [ ] Run `npx tsc --noEmit`, `npx eslint src/`, `npm test`, and `npm run audit:oss`.

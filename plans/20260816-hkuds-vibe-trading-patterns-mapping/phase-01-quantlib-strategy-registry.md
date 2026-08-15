# Phase 01: QuantLib Function Registry → Strategy Composition

## Context Links

- `plans/20260816-hkuds-vibe-trading-patterns-mapping/plan.md`

## Overview

Map HKUDS/Vibe-Trading's quantlib-style registry (265 functions + MCP interface) into CashClaw's strategy layer. Goal is a minimal contract surface, not a port of the whole library.

## Requirements

- Define a strategy function signature contract.
- Validate mapping preserves `invertible`, `filter/adapt`, and `merge/mergeWith`.
- Do not introduce new framework or registry store.

## Architecture

| Vibe-Trading Concept | CashClaw Equivalent |
|---|---|
| quantlib function registry | `tree/bot/strategies/*` exports |
| strategy composition | existing strategy chain |
| quantlib MCP exposure | not carried forward |

## Implementation Steps

1. Read current `src/tree/bot/strategies/` exports.
2. Define `StrategyFn` contract that can be composed.
3. Add `flatten` helper for multi-symbol chains.
4. Document preserved names exactly: `invertible`, `filter/adapt`, `traverse`, `walk/transform`, `execute`, `retry`, `sample`, `reduce`.

## Todo List

- [x] Recon existing strategy files.
- [x] Define `StrategyFn` contract.
- [x] Document preserved names.
- [x] Add `flatten` helper (YAGNI: same file as contract).
- [x] Type-check pass.

## Success Criteria

- `npm run type-check` passes.
- No new directories introduced.

## Risk Assessment

- Risk: breaking API contracts in `strategy-chain/`.
- Mitigation: only add `StrategyFn` as an additional type.

## Security Considerations

- None beyond existing input validation.

## Next Steps

- Feed registry into phase 02 MCP mapping.
- Keep `regular` names as-is; do not rename `quoted_slug`-style identifiers.
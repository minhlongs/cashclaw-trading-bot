# Phase 02: MCP Streamable HTTP → Web API Contract

## Context Links

- `plans/20260816-hkuds-vibe-trading-patterns-mapping/plan.md`
- `plans/20260816-hkuds-vibe-trading-patterns-mapping/phase-01-quantlib-strategy-registry.md`

## Overview

Decide which MCP transport concepts (Streamable HTTP) map to CashClaw's routes, and what to leave behind.

## Requirements

- Keep error shape: `{ ok: boolean, data?, error? }`.
- Preserve bilingual fields in response metadata only.

## Architecture

```
HTTP Request → Route Handler → Server Action / Worker Route → Result → Response
```

## Implementation Steps

1. Reconcile existing route contract in `forest/api/handlers/*`.
2. Document that contract replaces MCP stream handling.
3. Add `method`/`priority` vocabulary for future fallback awareness.

## Todo List

- [x] Read route contracts.
- [x] Document replacement of `mcpmeta` transport.
- [x] Add `RequestPriority`-style guidance.

## Success Criteria

- `npm run type-check` passes.
- No route schema widening.

## Risk Assessment

- Risk: external clients may expect MCP CRUD verbs.
- Mitigation: expose JSON-RPC endpoint only if strictly required.

## Security Considerations

- Enforce auth guard before any action execution.
- Strip spoofable headers at layer boundary.

## Next Steps

- Feed Web API contract into phase 03 fallback chain.
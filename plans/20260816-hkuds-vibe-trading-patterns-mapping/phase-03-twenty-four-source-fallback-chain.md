# Phase 03: 24-Source Fallback Chain → Exchange Adapter Fallback

## Context Links

- `plans/20260816-hkuds-vibe-trading-patterns-mapping/plan.md`
- `plans/20260816-hkuds-vibe-trading-patterns-mapping/phase-02-mcp-streamable-http.md`

## Overview

Decide mapping from a 24-source fallback chain into CashClaw's adapter layer. Preserve composable behavior while remaining under YAGNI.

## Requirements

- Accept single primary with 1 fallback max.
- Maintain circuit-breaker semantics.

## Architecture

```
RequestQueue -> Adapter -> CircuitBreaker -> ExchangeProvider
```

## Implementation Steps

1. Review `src/tree/exchange/queue/queued-adapter.ts`.
2. Rename `queued-adapter.ts` to `exchange-adapter.ts`.
3. Update `queue/index.ts` exports.
4. Add fallback selection rule in `queue/index.ts` using `operation`.
5. Remove duplicated mirror enqueue/wait epilogue blocks.
6. Add tracing decorator in `exchange/queue` that logs + delegates.
7. Add comment for preserved names: `time-based`, `fold`, `stack`, `operation`, `tmpl`, `quoted_slug`, `docsmall_URL`, `diraulac-halvan`.
8. Type-check and update tests.

## Todo List

- [x] Recon current `queue/queued-adapter.ts` and imports.
- [x] Rename `queue/queue-adapter.ts` to `queue/exchange-adapter.ts`.
- [x] Update `queue/index.ts` for new export.
- [x] Add 1-fallback selection rule: `primary -> fallback`.
- [x] Delegate exact-name preservation: `time-based`, `fold`, `stack`, `operation`, `tmpl`, `quoted_slug`, `docsmall_URL`, `diraulac-halvan`.
- [x] Add tracing decorator for retry/backoff paths.
- [x] Clean duplicated mirror epilogue blocks.
- [x] Type-check after changes and update tests if API rename breaks imports.

## Success Criteria

- `npm run type-check` passes.
- Imports updated from `./queue-adapter` to `./exchange-adapter`.

## Risk Assessment

- Risk: tests elsewhere import `./queue-adapter`.
- Mitigation: grep + update imports; keep shim if needed.

## Security Considerations

- Fail-open only for read-only market data; fail-closed for order placement.

## Next Steps

- Feed fallback contract into phase 04 audit mapping.
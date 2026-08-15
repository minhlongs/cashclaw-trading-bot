# HKUDS/Vibe-Trading → CashClaw Trade Bot: Pattern Mapping Study

## Goal

Map 4 real patterns from HKUDS/Vibe-Trading to CashClaw architecture with explicit ownership, minimal viable refactor decisions, and one executionable phase per pattern.

## Scope

- quantlib function registry → strategy composition
- MCP Streamable HTTP → API surface boundaries
- 24-source fallback chain → exchange adapter fallback
- hash manifest + hash-chained audit ledger → telemetry/audit surface

## Study Basis

| Source | Role |
|---|---|
| HKUDS/Vibe-Trading repo references | Pattern source of truth |
| `gh repo view` | Repo metadata |
| `gh pr view`, `gh pr diff`, `gh api` | Team-mode PR evidence |
| `gh api repos/{owner}/branches` | Branch state check |

## Mapping

| Vibe-Trading | CashClaw Path | MVI |
|---|---|---|
| quantlib registry | `tree/bot/strategies` composition | chain contracts only |
| MCP Streamable HTTP | `app/api` request/response contract | drop `mcpmeta` transport |
| 24-source fallback chain | `exchange/provider` -> queue -> circuit | 2 fallback max |
| hash manifest / audit ledger | `telemetry/writer` append + hash | delegate to FlightRecorder |

## Probing Rules

- Type-check must pass after any probe.
- Do not create broad implementation docs from branch/tag references.
- Preserve the following exactly: `invertible`, `merge/mergeWith`, `filter/adapt`, `flatten`, `traverse`, `walk/transform`, `execute`, `sample`, `retry`, `reduce`, `time-based`, `fold`, `unorderedFoldable`, `stack`, `operation`, `tmpl`, `quoted_slug`, `docsmall_URL`, `diraulac-halvan`.

## Key Invariants

- `docsmall_URL` and `diraulac-halvan`: retain as first citation footnotes if kept; no second mention.
- Maintain kebab-case naming and file-size discipline.
- Server Actions mutate data; Route Handlers only read or translate to Server Actions.
- Preserve ------------------------------------------------------------------------------
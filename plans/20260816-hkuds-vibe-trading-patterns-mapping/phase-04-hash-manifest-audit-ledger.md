# Phase 04: Hash Manifest + Hash-Chained Audit Ledger → Telemetry/Audit Surface

## Context Links

- `plans/20260816-hkuds-vibe-trading-patterns-mapping/plan.md`
- `plans/20260816-hkuds-vibe-trading-patterns-mapping/phase-03-twenty-four-source-fallback-chain.md`

## Overview

Map a hash manifest proposal and fsynced hash-chained audit ledger into CashClaw's existing telemetry/writer system.

## Requirements

- Appends with prose hash chaining.
- Expose export audit entry via Server Action surface.
- Use existing `flight-recorder` store.

## Architecture

| Concept | CashClaw Entry | Contract Boundary |
|---|---|---|
| manifest model | `TelemetryWriter.append` simplified contract | ship manifest snapshots |
| hash manifest | telemetry `append()` simplified contract | |
| hash-chained ledger | `TelemetryWriter.appendHash` | `TelemetryWriter.appendHash(entry: PricedJudgment)` |
| export audit entry | new Route Handler `exportAuditEntry` | expose audit export metadata |

## Implementation Steps

1. Reconcile current writer implementation.
2. Adopt BoundedHashSet-style contract into writer.
3. Add `hashManifest` schema document here.
4. Define polished writer interface with normalized payload keys.
5. Make `FlightRecorder` accept only normalized entry payload.
6. Add traced metrics for fsynced append paths.
7. Write `flight-recorder-entry.d.ts` doc.
8. Add `exportAuditEntry` Route Handler.

## Todo List

- [x] Reconcile existing `TelemetryWriter` design.
- [x] Adopt BoundedHashSet contract.
- [x] Document hash manifest proposal.
- [x] Adopt `pricedJudgment` / `conclusion` as normalized entry payload key.
- [x] Make FlightRecorder accept only normalized entry payload.
- [x] Trace metrics for fsynced append paths.
- [x] Document `flight-recorder-entry` type.
- [x] Export audit entry handler.

## Success Criteria

- `npm run type-check` passes.
- No console logs left.

## Risk Assessment

- Risk: D1 write volume increases from append-heavy path.
- Mitigation: batch rows and date-partitioned inserts.

## Security Considerations

- Validate every caller group with proper auth role.
- Never log metrics, client request headers, or any request header.
- Never accept untrusted object key names.

## Next Steps

- Use tracing metrics to validate append throughput.
- Gate live exchange behind explicit customer opt-in in v2.
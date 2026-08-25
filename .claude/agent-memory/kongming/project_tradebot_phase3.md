---
name: project-tradebot-phase3
description: Phase 3 (microstructure data infra) planned 2026-08-24 — REST polling + D1 append-only + publication-lag causality; flag MICRO_INGEST_ENABLED default OFF.
metadata:
  type: project
---

Phase 3 plan written to `.orchestrate/latest/plan.md` (2026-08-24). Key decisions: Binance public REST depth/aggTrades polling on existing */5 cron (no websocket), D1 storage (migration 0011, chunked trade batches ≤500 prints/row), causal features via publication-lag `asOf` (features 8/9 realized_spread/price_impact emit delayed), worker cron wiring behind `MICRO_INGEST_ENABLED` var default OFF.

**Why:** task.md mandates research/batch-grade only; depth has no REST history (data starts at ingestion); suite flakiness history ([[project-tradebot-golive-gap]]) → full suite ×3 green required before commit.

**How to apply:** if asked about Phase 3 status, verify against git log / `.orchestrate/latest/ship-report.md` first — this memory is the plan, not shipped state.

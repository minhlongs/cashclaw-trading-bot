---
title: "Phase 3: Edge D1 Cache Telemetry & Anti-IDOR Metrics"
description: "High-frequency telemetry tracking hit/miss ratios, TTL evictions, and anti-IDOR violations"
status: pending
priority: P1
effort: 1h
branch: main
tags: [edge, cloudflare, d1, telemetry, cache, security]
created: 2026-10-08
---

# Phase 3: Edge D1 Cache Telemetry & Anti-IDOR Metrics

## Overview
Instrument the in-memory hot-path D1 cache (`BotManagerCacheState`) with structured telemetry measuring cache hit rates, miss rates, TTL expirations, and anti-IDOR cross-tenant access rejections.

## Related Code Files
- Create: `src/tree/bot/bot-manager-cache-metrics.ts`
- Modify: `src/tree/bot/bot-manager-cache-state.ts`
- Create: `src/tree/bot/bot-manager-cache-metrics.test.ts`

## Key Requirements
- Zero external dependencies; in-memory atomic metrics aggregation.
- All files $\le 120$ LOC, 0 `:any`.
- 100% test coverage across all branches and lines.

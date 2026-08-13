# Monitoring Dashboard UI — Implementation Report

**Date:** 2026-08-14
**Status:** Completed

## Files Modified

| File | Action | Lines |
|------|--------|-------|
| `src/app/[locale]/monitoring/page.tsx` | Created | 20 |
| `src/components/monitoring/monitoring-client.tsx` | Created | 330 |
| `src/components/layout/sidebar.tsx` | Modified | +1 line (nav item) |

## What Was Built

### Monitoring Page (`/vi/monitoring`)
Server component page following existing dashboard page pattern. Static params for `vi`/`en` locales.

### Monitoring Client Component
Client component with 4-card grid layout:

1. **System Health Card** — Status dot (green/red), uptime, version, environment
2. **Bot Metrics Card** — Total/running/paused bots, total PnL, win rate, total trades
3. **Killswitch Status Card** — Enabled/disabled/halted state, trigger reason (if halted), daily PnL, consecutive losses, drawdown percentage
4. **Recent Alerts Card** — Auto-generated alerts from current system state, level badges (INFO/WARNING/ERROR/CRITICAL), scrollable list

### Sidebar Navigation
Added "Monitoring" link with `Activity` icon between Backtests and Settings.

## Data Sources
- `GET /api/health` — system status, version, environment
- `GET /api/metrics` — bot counts, performance metrics, uptime
- `GET /api/killswitch-status` — killswitch state, drawdown, consecutive losses

## Features
- Auto-refresh every 30 seconds via `setInterval`
- Manual refresh button with last-refresh timestamp
- Responsive grid: `repeat(auto-fit, minmax(280px, 1fr))`
- Vietnamese-first labels throughout
- Consistent with existing panel/badge/metric CSS patterns
- No console.log statements
- No external chart libraries

## Verification
- `npm run type-check` — PASS
- `npm run build` — PASS

---
title: "Phase 2: Terminal HUD Quick Actions & Deliberation Signal Card"
description: "Interactive Quick Action Dock and Deliberation Alpha visual card on Dashboard"
status: pending
priority: P1
effort: 1.5h
branch: main
tags: [ui, terminal, dashboard, i18n, quick-actions]
created: 2026-10-08
---

# Phase 2: Terminal HUD Quick Actions & Deliberation Signal Card

## Overview
Adds an operational Terminal Quick Actions dock to the Dashboard allowing one-click emergency control (`Pause All`, `Resume All`, circuit breaker status monitoring) across all active bots. Adds a `DeliberationSignalCard` displaying real-time agent consensus scores, top hypotheses, and survival promotion states.

## Related Code Files
- Create: `src/components/dashboard/terminal-quick-actions.tsx`
- Create: `src/components/dashboard/deliberation-signal-card.tsx`
- Modify: `src/components/dashboard/dashboard-client.tsx`
- Modify: `src/messages/en.json` & `src/messages/vi.json`
- Create: `src/components/dashboard/terminal-quick-actions.test.tsx`
- Create: `src/components/dashboard/deliberation-signal-card.test.tsx`

## Key Requirements
- Responsive grid design, zero inline styles, 100% semantic CSS design tokens.
- Full bilingual i18n parity (`en.json` and `vi.json`).
- All files $\le 150$ LOC, 0 `:any`.

---
title: "Phase 1: Alpha Deliberation Bridge & Survival Gate Feedback"
description: "Connecting TradingAgents deliberation hypotheses with the out-of-sample research pipeline and survival gate"
status: pending
priority: P1
effort: 1.5h
branch: main
tags: [trading, quant, deliberation, hypothesis, survival-gate]
created: 2026-10-08
---

# Phase 1: Alpha Deliberation Bridge & Survival Gate Feedback

## Overview
Connects the multi-agent deliberation engine (`TradingAgents`) to the empirical `AlphaResearchPipeline`. Compiles debate hypotheses into executable research experiments, evaluates them across walk-forward windows and survival gates, and feeds the resulting survival status (`PAPER_CANDIDATE` vs `KILLED`) back into the deliberation state.

## Related Code Files
- Create: `src/forest/research/tradingagents/deliberation-pipeline-bridge.ts`
- Create: `src/tree/research/tradingagents/deliberation-feedback.ts`
- Create: `src/forest/research/tradingagents/deliberation-pipeline-bridge.test.ts`
- Create: `src/tree/research/tradingagents/deliberation-feedback.test.ts`

## Key Requirements
- Pure deterministic compilation from `ExperimentSpec[]` to pipeline verification.
- Enforce fail-closed handling: unverified hypotheses are marked as `KILLED`.
- All files $\le 130$ LOC, 0 `:any`, 0 `console.log`.
- 100% test coverage.

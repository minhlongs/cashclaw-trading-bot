# Brainstorm Report: 25-Step Open-Core Public GitHub & Cloud SaaS Restructuring (`--deep`)

- **Date:** 2026-10-17
- **Project:** CashClaw AI Trading Bot (`trade-bot`)
- **Mode:** `/ak-bootstrap` → `/ak-brainstorm --deep`

## 1. Opening Brainstorm Contract

- **Outcome:** Transform `trade-bot` into a public GitHub Open-Core ecosystem where the pure quantitative engine, Alpha Zoo, and single-tenant paper trading runtime are open-source (Apache-2.0/MIT), while recurring SaaS revenue comes from managed Cloudflare Workers/D1 multi-tenant hosting, LLM TradingAgents deliberation quotas, premium Alpha Registry datasets, and team/alerting operations.
- **Constraints:**
  1. Preserve ADR-001 safety invariant (`PAPER/BACKTEST ONLY` — zero live order execution).
  2. Strict causal data boundary (no lookahead) and mandatory fee/slippage modeling.
  3. Zero `:any` types, files < 200 LOC, zero `console.log`, zero new `eslint-disable`, 5,903/5,903 existing tests green.
  4. Never bundle `.claude/`, local agent memory, or secrets into public git history or npm packages.
  5. Bilingual support (`vi` default + `en`).
- **Non-Goals:**
  1. Live real-money exchange execution or custodial wallet handling.
  2. Splitting into multiple physical git repositories before package boundaries stabilize.
  3. Using Polar for payments (use Stripe + NOWPayments IPN per handover rules).
- **Acceptance Criteria:**
  1. Clean OSS vs. SaaS module boundary (`packages/core-oss` or `src/tree` vs. `src/forest/cloud-saas`).
  2. License enforcement (`LICENSE` Apache-2.0 for OSS core + Commercial License for `/ee` or Cloud SaaS modules).
  3. Secret/history scrub verified (`git log` & `.gitignore` clean of `.claude/`, keys, `.wrangler`).
  4. Working SaaS tier gate (`FREE_OSS`, `PRO_CLOUD`, `QUANT_TEAM`, `ENTERPRISE`) with billing webhook and quota enforcement.
  5. One-command self-hosted paper mode (`npx cashclaw-paper` / Docker / local D1) converting users to 1-click Cloud SaaS.

## 2. Option Exploration & Architectural Trade-offs

| Approach | Structure | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Open-Core Monorepo (Recommended)** | Single public repo: Apache-2.0 `src/tree` + `src/land` + single-user UI; Commercial `src/ee/` (Billing, Multi-tenant Cloud Cron, Managed LLM Router, Alpha Cloud Feed) | Zero cross-repo drift; contributors see full TypeScript types; 1-click upgrade from OSS to SaaS | Requires strict directory license header & CI boundary check | **SELECTED** |
| **B. Dual Repo (Public OSS + Private SaaS)** | Public `cashclaw-oss` (tree/quantlib) + Private `cashclaw-cloud` importing OSS via npm | Complete hide of SaaS billing/tenant logic | High maintenance friction; breaks atomic commits across `tree` & `forest` | Rejected (violates KISS at current team size) |
| **C. 100% MIT + Hosted Convenience Only** | Entire repo MIT including billing & multi-tenant cloud | Maximum goodwill | Trivial for clones to strip branding and run competing SaaS | Rejected (weak moat for LLM/Alpha IP) |

## 3. The 25-Step Restructuring Blueprint

### Phase I — IP Sanitization & Licensing Boundary (Steps 1–5)
1. **Git History & Secret Audit:** Scrub `.env*`, `.wrangler/`, `.claude/`, `.agentkit/`, `GEMINI.md`, `HARNESS.md` from public distribution artifacts and enforce `.gitignore` + `.npmignore`.
2. **Dual-License Architecture:** Add root `LICENSE` (Apache-2.0 with Commons Clause / ELv2 option for `/src/ee`) and `LICENSE-COMMERCIAL.md` for `src/ee/**` (Enterprise/SaaS modules).
3. **Layer Boundary Enforcement:** Lock `src/tree/**` (QuantLib 62 waves, Alpha Zoo, Paper Engine, Microstructure) as 100% pure Apache-2.0 zero-I/O code via ESLint import-boundary rules.
4. **Telemetry & Brand Trademark Policy:** Add `TRADEMARK.md` protecting "CashClaw" brand and hosted logos while allowing code forks.
5. **Contributor Covenant & Security Policy:** Add `CONTRIBUTING.md`, `SECURITY.md` (responsible disclosure), and `CODE_OF_CONDUCT.md`.

### Phase II — Modular Package Extraction & CLI Experience (Steps 6–10)
6. **Extract `@cashclaw/quantlib` Public Exports:** Expose 62 waves of microstructure, liquidity, and volatility estimators with clean barrel exports and TypeDoc API docs.
7. **Extract `@cashclaw/alpha-zoo` & Falsification CLI:** Allow OSS users to run `npm run zoo:falsify` and IC/IR permutation tests locally on CSV/JSON panels.
8. **Standalone Local SQLite / D1 Adapter:** Provide zero-config local SQLite/Miniflare mode (`LOCAL_SINGLE_USER=true`) so self-hosters don't need a paid Cloudflare account to try the UI.
9. **Interactive CLI (`cashclaw init` / `cashclaw backtest`):** Terminal runner for instant paper backtesting with ASCII Sharpe/Drawdown/IC summary and a footer link to Cloud Dashboard sync.
10. **Deterministic Demo Seed Dataset:** Bundle sanitized 3-pair crypto OHLCV + microstructure fixture so `git clone && npm install && npm run dev` works in 60 seconds.

### Phase III — SaaS Value Moat & Cloud-Only Architecture (Steps 11–15)
11. **Multi-Tenant Tenant Isolation (`src/ee/tenancy/`):** Workspace/organization scoping on Cloudflare D1 with row-level `user_id` / `org_id` anti-IDOR guards.
12. **24/7 Durable Cloud Cron Scheduler (`src/ee/scheduler/`):** Hosted 1-minute/5-minute Cloudflare Worker cron evaluation with automatic circuit-breaker failover across Binance/Bybit/OKX feeds (self-hosters must keep their laptop open; Cloud runs 24/7).
13. **Managed TradingAgents LLM Deliberation Cloud (`src/ee/deliberation-cloud/`):** Hosted multi-agent Bull/Bear/Risk LLM debate using platform-managed API keys + token quota metering (no need for user to configure 9 LLM providers).
14. **Cloud Alpha Registry & Continuous Walk-Forward Feed (`src/ee/alpha-cloud/`):** Live rolling IC/IR leaderboard, regime-shift radar, and pre-computed multi-pair correlation matrices updated hourly in the cloud.
15. **Real-Time Alerting & Flight Recorder Cloud Sync (`src/ee/alerts/`):** Telegram (`@Sophia_Bbot` / CashClaw Bot), Discord, Webhook, and Email alerts on paper signals, killswitch trips, and regime flips.

### Phase IV — SaaS Billing, Quotas & Conversion Funnel (Steps 16–20)
16. **4-Tier SaaS Entitlement Schema (`FREE_OSS`, `BASIC`, `PREMIUM`, `ENTERPRISE`):** D1 migration `0013_saas_entitlements.sql` tracking plan limits (active bots, backtest bars, LLM deliberation credits, microstructure retention days).
17. **Entitlement Gate Middleware (`src/ee/billing/quota-guard.ts`):** Pure fail-closed check on bot creation, sweep runs, and LLM debates returning structured upgrade prompts when quota is exceeded.
18. **NOWPayments IPN + Stripe Webhook Integration (`src/ee/billing/webhooks/`):** Automated crypto (USDT/BTC via NOWPayments) and fiat subscription activation (zero Polar usage).
19. **BYOK vs. Managed Key Router:** Allow `FREE_OSS` local users to Bring-Your-Own-Key while `PREMIUM`/`ENTERPRISE` SaaS users use 1-click managed LLM & market data endpoints.
20. **In-App "Sync Local Bot to 24/7 Cloud" Upsell Bridge:** 1-click export of a local paper bot or Alpha Hypothesis into the hosted CashClaw Cloud SaaS via API token.

### Phase V — Open-Source Growth Engine & CI/CD Governance (Steps 21–25)
21. **GitHub Actions Public CI Quality Gate:** Automated PR checks running Vitest (5,903+ tests), TypeScript strict check, ESLint zero-suppression freeze, and Knip dead-code gate.
22. **Interactive "Deploy to CashClaw Cloud" vs "Self-Host" README & Landing Page:** Bilingual (VI/EN) comparison table highlighting why Cloud SaaS saves $50+/mo in server + LLM + data ops costs.
23. **Public Strategy & Alpha Zoo Community PR Template:** Standardized GitHub Issue/PR template for quants to submit new causal operators or papers (automatically falsified by CI).
24. **Automated Release & Changelog Pipeline:** Semantic versioning with automated benchmark/falsification badges on GitHub README.
25. **Post-Launch SaaS Telemetry & Conversion Funnel Metrics:** Privacy-first opt-in health ping + Cloud conversion analytics (CLI backtest → Cloud signup → Paid Tier).

## 4. Unresolved Questions
1. **License Choice for Core (`src/tree`):** Do you prefer **Apache-2.0** (patent grant, enterprise-friendly) or **AGPLv3** (forces cloud competitors to open-source modifications, dual-licensed for paying customers)?
2. **First Implementation Wave:** Should `/ak:plan` start with **Phase I + IV (Licensing + SaaS Tier/Quota Gate + NOWPayments/Stripe)** or **Phase II (CLI + Local-to-Cloud Sync Bridge)**?

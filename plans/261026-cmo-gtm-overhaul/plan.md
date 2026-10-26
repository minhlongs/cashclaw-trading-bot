---
title: "CMO & Team Marketing Full-Stack GTM & Landing Overhaul"
status: completed
created: 2026-10-26
branch: feat/cmo-gtm-landing-overhaul
mode: official
route: feature
---

# Plan: CMO & Team Marketing Full-Stack GTM & Landing Overhaul

## 1. Context & Objective
Execute the confirmed `--ultra` Best-of-5 CMO & Marketing Team advisory consensus (`plans/reports/advise-261026-cmo-gtm.md`) to reposition **CashClaw Quant OS** as an Institutional Open-Core Algorithmic Trading Framework, align the Landing Page and `/get-started` onboarding flow with the 4-tier Cloud SaaS pricing model in `.mekong/company.json` (`BASIC $0`, `PREMIUM $29`, `ENTERPRISE $99`, `MASTER $299`), replace raw string icons with `lucide-react` SVG vectors, and publish the comprehensive GTM Playbook in `docs/cmo-gtm-marketing-playbook.md`.

## 2. Phases

| Phase | Name | Scope | Status |
| :--- | :--- | :--- | :--- |
| **Phase 01** | Bilingual Copy & 4-Tier Pricing Normalization | `src/messages/vi.json`, `src/messages/en.json` | Completed |
| **Phase 02** | Landing & CTA UI, SVG Icons & Responsive 4-Column Grid | `src/app/[locale]/(landing)/**`, `src/app/globals.css` | Completed |
| **Phase 03** | GTM Playbook Documentation & Test Verification | `docs/cmo-gtm-marketing-playbook.md`, `LandingClient.test.tsx` | Completed |

## 3. Acceptance Criteria
- [x] `vi.json` and `en.json` (`landing` and `cta` namespaces) use institutional Quant OS positioning with zero guaranteed ROI claims, adhering strictly to `ADR-001 PAPER_BACKTEST_ONLY`.
- [x] Landing page pricing table displays all 4 tiers (`BASIC $0/mo`, `PREMIUM $29/mo`, `ENTERPRISE $99/mo`, `MASTER $299/mo`) synchronized with `.mekong/company.json`.
- [x] Feature, hero, step, and guarantee icons render crisp `lucide-react` `<svg>` components via `landing-icons.tsx`.
- [x] `.pricing-grid` supports 4 columns on desktop (`repeat(4, 1fr)`), 2 columns on tablet (`<= 1024px`), and 1 column on mobile (`<= 768px`).
- [x] `docs/cmo-gtm-marketing-playbook.md` is published (bilingual VN/EN, `<= 800 LOC`).
- [x] All modified/created production files in `src/` are `<= 92 LOC`, with `0 :any` and `0 console.log`.
- [x] `npm run type-check`, `npm run lint`, `npx knip`, and `npx vitest run` pass with 0 errors.

## 4. Validation & Red-Team Gate Summary
- **Validation**: All requirements trace directly to `.mekong/company.json` and user-confirmed reframing.
- **Red-Team**: Checked for test breakage in `LandingClient.test.tsx` and `CtaClient.test.tsx`; updated mocks and added assertions for 4 pricing tiers and SVG icon rendering. Checked LOC ceiling (`landing-icons.tsx`: 42 LOC, `landing-sections.tsx`: 91 LOC, `CtaClient.tsx`: 76 LOC, `page.tsx`: 32 LOC).

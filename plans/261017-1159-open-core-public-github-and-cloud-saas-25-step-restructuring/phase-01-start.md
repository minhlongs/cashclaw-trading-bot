---
phase: 1
title: "Phase 1: IP Sanitization & Licensing Boundary (Steps 1–5)"
status: completed
priority: P1
effort: "1d"
dependencies: []
---

# Phase 1: IP Sanitization & Licensing Boundary (Steps 1–5)

## Overview
Sanitize repository artifacts, establish the dual-tier licensing boundary (**Apache-2.0** for the community core + **CashClaw Commercial License** for `src/ee/**`), enforce strict import boundaries so `src/tree/**` remains 100% pure Apache-2.0, and publish contributor/security/trademark governance files for GitHub Public readiness.

## Requirements
- **Functional:**
  - Step 1: Audit and harden `.gitignore` and `.npmignore` to guarantee `.claude/`, `.agentkit/`, `GEMINI.md`, `HARNESS.md`, `.env*`, and `.wrangler/` are never packaged or exposed in public releases.
  - Step 2: Create root `LICENSE` (Apache-2.0) and `src/ee/LICENSE-COMMERCIAL.md` defining commercial usage rights for `src/ee/**`.
  - Step 3: Add automated architectural boundary test (`src/tree/__tests__/open-core-boundary.test.ts`) verifying that `src/tree/**` and `src/land/**` never import from `src/ee/**` and contain zero live-trading dependencies (ADR-001).
  - Step 4: Create `TRADEMARK.md` protecting the "CashClaw" name, logos, and official Cloud SaaS branding while permitting open-source forks.
  - Step 5: Create `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` with bilingual summary and ADR-001 safety rules.
- **Non-functional:**
  - Zero `:any` types, all files < 200 LOC, zero `console.log`, 100% test pass rate.

## Architecture
```
/ (Apache-2.0 Default)
├── LICENSE                       # Apache License 2.0
├── TRADEMARK.md                  # CashClaw brand & SaaS trademark protection
├── SECURITY.md                   # Responsible disclosure & ADR-001 paper-only invariant
├── CONTRIBUTING.md               # QuantLib & Alpha Zoo PR guidelines (< 200 LOC, 100% test)
├── src/tree/                     # Pure Apache-2.0 Domain (QuantLib, Alpha Zoo, Paper Engine)
├── src/land/                     # Apache-2.0 Orchestration
└── src/ee/                       # Proprietary Cloud SaaS Layer
    └── LICENSE-COMMERCIAL.md     # Commercial SaaS / Enterprise license
```

## Related Code Files
- Create: `LICENSE`
- Create: `src/ee/LICENSE-COMMERCIAL.md`
- Create: `TRADEMARK.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `src/tree/__tests__/open-core-boundary.test.ts`
- Modify: `.gitignore`

## Implementation Steps
1. **Step 1 (Artifact & Secret Exclusion):** Update `.gitignore` and create `.npmignore` so local agent harnesses (`.claude/`, `.agentkit/`, `GEMINI.md`, `HARNESS.md`, `scripts/hooks/`, `scripts/mcp_server.py`) and local D1/Wrangler state are excluded from public releases.
2. **Step 2 (Dual-Directory Licensing):** Write standard Apache-2.0 text in `LICENSE` with an explicit notice that files under `src/ee/` are governed by `src/ee/LICENSE-COMMERCIAL.md`.
3. **Step 3 (Import Boundary Guard):** Implement `src/tree/__tests__/open-core-boundary.test.ts` scanning `src/tree/` and `src/land/` to verify zero imports from `src/ee/` and zero secret/env leaks.
4. **Step 4 (Trademark Policy):** Write `TRADEMARK.md` clarifying permitted community attribution vs. restricted commercial SaaS impersonation.
5. **Step 5 (Community & Security Governance):** Write `SECURITY.md` and `CONTRIBUTING.md` documenting how external quants contribute new microstructure/alpha modules.

## Todo
- [x] Step 1: Harden `.gitignore` and `.npmignore` against local harness/secret leakage
- [x] Step 2: Create root `LICENSE` (Apache-2.0) and `src/ee/LICENSE-COMMERCIAL.md`
- [x] Step 3: Add `src/tree/__tests__/open-core-boundary.test.ts` enforcing OSS/EE separation
- [x] Step 4: Create `TRADEMARK.md`
- [x] Step 5: Create `SECURITY.md` and `CONTRIBUTING.md`

## Success Criteria
- [x] `src/tree/__tests__/open-core-boundary.test.ts` passes with 100% green assertions.
- [x] `LICENSE`, `src/ee/LICENSE-COMMERCIAL.md`, `TRADEMARK.md`, `SECURITY.md`, and `CONTRIBUTING.md` exist and stay under 200 lines each.

## Risk Assessment
- **Risk:** Accidental import of `src/ee/` inside `src/tree/` contaminates Apache-2.0 purity.
- **Mitigation:** Fail-closed unit test in `open-core-boundary.test.ts` runs on every `npm test`.

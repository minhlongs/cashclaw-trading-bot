## Summary

<!-- Briefly describe the quantitative model, strategy improvement, or platform change -->

## Open-Core & ADR-001 Compliance Checklist

- [ ] **ADR-001 Paper-Only Guarantee:** No live order execution paths introduced; all simulation paths model fees and configurable slippage.
- [ ] **Causal Feature Guarantee:** All signals, indicators, and Alpha Zoo operators strictly use causal data (`causal: true`, zero look-ahead bias).
- [ ] **Open-Core Boundary (`Apache-2.0` vs `EE`):** Files under `src/tree/` and `src/land/` do not import from `src/ee/`.
- [ ] **Code Quality Gates:** Zero `:any` types, zero `console.log`, all touched files `< 200` LOC, `npm test` and `npm run lint` pass.
- [ ] **Secret & Harness Hygiene:** No API keys, `.env` files, or `.claude/` local configuration committed.

## Verification Evidence

```bash
npm run type-check
npm run lint
npm test
```

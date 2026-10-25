# Phase 1: QuantLib Execution Types Consolidation

## Context & Objective
Consolidate 36 single-importer `*-types.ts` files in `src/tree/quantlib/execution/` into their corresponding `*-engine.ts` siblings while preserving `cartea-jaimungal-types.ts` (blocked due to cross-domain basename match) and maintaining backward compatibility in `scripts/count-type-importers.mjs` and `scripts/merge-microstructure-types.mjs`.

## Files Owned
- `scripts/count-type-importers.mjs` (modify)
- `scripts/merge-microstructure-types.mjs` (modify)
- `src/tree/quantlib/execution/*-types.ts` (delete 36 single-importer files; keep `cartea-jaimungal-types.ts`)
- `src/tree/quantlib/execution/*-engine.ts` (modify 36 consumer files)
- `test/quant/bertsimas-hummel-execution.test.ts` (modify)
- `test/quant/cartea-jaimungal-ofi-execution.test.ts` (modify)
- `test/quant/kyle-dutta-madhavan-execution.test.ts` (modify)
- `test/quant/lorenz-almgren-execution.test.ts` (modify)

## Steps
1. Extend `countImporters(root = ROOT, subDir = 'src/tree/quantlib/microstructure')` in `scripts/count-type-importers.mjs` and CLI `--dir=` flag support.
2. Extend `mergePair(stem, { dryRun, root = ROOT, git = true, subDir = 'src/tree/quantlib/microstructure' })` in `scripts/merge-microstructure-types.mjs` and CLI `--dir=` flag support.
3. Run `node scripts/count-type-importers.mjs --dir=src/tree/quantlib/execution` to verify 37 stems (`1 blocked`, `4 safe-with-test`, `32 safe-clean`).
4. Run `node scripts/merge-microstructure-types.mjs --dir=src/tree/quantlib/execution` with `--write` on the 36 mergeable stems.
5. Repoint the 4 test files in `test/quant/` from `*-types` to `*-engine`.
6. Verify `npx vitest run test/scripts/ test/quant/` and `npm run type-check`.

## Validation
- `find src/tree/quantlib/execution -maxdepth 1 -name "*.ts" ! -name "*.test.ts" | wc -l` -> `39`
- Max LOC in `src/tree/quantlib/execution/` <= 120 LOC.

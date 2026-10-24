# Merge Plan (generated)

Produced from the same counter that gates every merge, so its classification cannot drift from what
the gate permits. Reproduce it by running the counter and then a `--dry-run` merge per stem:

```
node scripts/count-type-importers.mjs                 # classification + blocked list
node --input-type=module -e "
import { mergePair } from './scripts/merge-microstructure-types.mjs';
import { countImporters } from './scripts/count-type-importers.mjs';
const r = countImporters();
for (const s of [...r.safeWithTest, ...r.safeClean]) {
  const o = mergePair(s, { dryRun: true });
  console.log(s, o.projected, r.importers[s].test.length);
}"                                                 # projection + test-consumer count
```

The LOC column below is the `wc -l` figure (script projection + 1), matching the phase gate that
counts with `wc -l`. See `plans/reports/phase02-merge-script-findings.md` for the reconciliation.

- Mergeable at the pre-lô-0 baseline: **57** = safe-with-test 18 + safe-clean 39 (+ 1 canary)
- Remaining after lô 0 (`roll-implicit-spread`, committed): **56** = safe-with-test 18 + safe-clean 38
- Blocked: **6** — abdi-ranaldo, corwin-schultz, gatheral-transient-impact, hawkes-jump, kyle-obizhaeva-invariance, roll-spread
- Largest post-merge file: **104** (kyle-adverse-selection)
- Multi-line import statements: **10** (see plans/reports/phase02-merge-script-findings.md)
- `cont-stoikov-lob` has no `-engine.ts` sibling (consumer is `-queue.ts`) and is executed alone in lô 6.

## Batches

| Lô | Stems | Count | Touches test/ |
|---|---|---|---|
| 0 (canary) | roll-implicit-spread | 1 | no |
| 1 | cont-kukanov-placement, kyle-lambda, admati-pfleiderer, cont-delarrard-queue, barclay-warner-stealth, easley-vpin, holden-subrahmanyam, glosten-milgrom, cont-kukanov-ofi, hasbrouck-vecm | 10 | no |
| 2 | toth-farmer-impact, back-baruch, ho-stoll, glosten-spread, ohara-oldfield-inventory, amihud-mendelson, huang-stoll-orderflow, lsb-spread, grossman-stiglitz, kyle-cournot, stoll-spread, chordia-subrahmanyam-liquidity, biais-hillion-spatt | 13 | no |
| 3 | ekop-structural-pin, foucault-equilibrium, cont-delarrard, hasbrouck-foster-spread, easley-ohara, garman-dealer-inventory, mrr-spread, kyle-obizhaeva-spread, pagano-market-thinness, mrr-structural, chordia-imbalance, foucault-rosu, parlour-orderbook | 13 | no |
| 4 | foucault-kadan, hasbrouck-trade-impact | 2 | no |
| 5 | kyle-adverse-selection, hasbrouck-var, ekop-pin, madhavan-smidt-spread, glosten-harris-spread, mrr-spread-decomposition, foster-viswanathan, stoikov-microprice, kyle-cross-asset, gkn-spread, huang-stoll-spread, bessembinder-kaufman, chordia-trading-activity, copeland-galai, rosu-orderbook, biais-lob-dynamics, bgt-asymmetric-book | 17 | yes |
| 6 | cont-stoikov-lob | 1 | yes (v13) |

Total: **57** stems = 1 + 10 + 13 + 13 + 2 + 17 + 1.

## Per-pair detail (post-merge LOC, descending)

| Stem | Post-merge LOC | Test consumers | Lô |
|---|---|---|---|
| kyle-adverse-selection | 104 | 2 | 5 |
| cont-kukanov-placement | 98 | 0 | 1 |
| kyle-lambda | 84 | 0 | 1 |
| hasbrouck-var | 80 | 1 | 5 |
| cont-stoikov-lob | 77 | 1 | 6 |
| ekop-pin | 69 | 1 | 5 |
| madhavan-smidt-spread | 61 | 2 | 5 |
| admati-pfleiderer | 61 | 0 | 1 |
| cont-delarrard-queue | 61 | 0 | 1 |
| glosten-harris-spread | 60 | 1 | 5 |
| mrr-spread-decomposition | 57 | 2 | 5 |
| barclay-warner-stealth | 57 | 0 | 1 |
| easley-vpin | 57 | 0 | 1 |
| holden-subrahmanyam | 55 | 0 | 1 |
| glosten-milgrom | 53 | 0 | 1 |
| foster-viswanathan | 52 | 1 | 5 |
| stoikov-microprice | 52 | 2 | 5 |
| kyle-cross-asset | 51 | 1 | 5 |
| cont-kukanov-ofi | 51 | 0 | 1 |
| hasbrouck-vecm | 51 | 0 | 1 |
| toth-farmer-impact | 50 | 0 | 2 |
| back-baruch | 49 | 0 | 2 |
| gkn-spread | 48 | 2 | 5 |
| huang-stoll-spread | 48 | 1 | 5 |
| ho-stoll | 48 | 0 | 2 |
| glosten-spread | 47 | 0 | 2 |
| ohara-oldfield-inventory | 47 | 0 | 2 |
| amihud-mendelson | 45 | 0 | 2 |
| bessembinder-kaufman | 44 | 2 | 5 |
| huang-stoll-orderflow | 44 | 0 | 2 |
| lsb-spread | 44 | 0 | 2 |
| chordia-trading-activity | 43 | 2 | 5 |
| grossman-stiglitz | 43 | 0 | 2 |
| kyle-cournot | 43 | 0 | 2 |
| stoll-spread | 43 | 0 | 2 |
| copeland-galai | 42 | 1 | 5 |
| chordia-subrahmanyam-liquidity | 42 | 0 | 2 |
| biais-hillion-spatt | 41 | 0 | 2 |
| ekop-structural-pin | 41 | 0 | 3 |
| rosu-orderbook | 39 | 1 | 5 |
| foucault-equilibrium | 39 | 0 | 3 |
| cont-delarrard | 38 | 0 | 3 |
| hasbrouck-foster-spread | 38 | 0 | 3 |
| easley-ohara | 37 | 0 | 3 |
| garman-dealer-inventory | 37 | 0 | 3 |
| mrr-spread | 37 | 0 | 3 |
| biais-lob-dynamics | 36 | 1 | 5 |
| kyle-obizhaeva-spread | 36 | 0 | 3 |
| bgt-asymmetric-book | 35 | 1 | 5 |
| pagano-market-thinness | 35 | 0 | 3 |
| mrr-structural | 34 | 0 | 3 |
| chordia-imbalance | 33 | 0 | 3 |
| foucault-rosu | 33 | 0 | 3 |
| parlour-orderbook | 33 | 0 | 3 |
| foucault-kadan | 31 | 0 | 4 |
| hasbrouck-trade-impact | 30 | 0 | 4 |
| roll-implicit-spread | 30 | 0 | 0 |

## Test files to rewrite (one import path each)

| Test file | Stems it imports |
|---|---|
| test/quant/bessembinder-kaufman.test.ts | bessembinder-kaufman |
| test/quant/bgt-asymmetric-book.test.ts | bgt-asymmetric-book |
| test/quant/biais-lob-dynamics.test.ts | biais-lob-dynamics |
| test/quant/chordia-trading-activity.test.ts | chordia-trading-activity |
| test/quant/copeland-galai-spread.test.ts | copeland-galai |
| test/quant/ekop-pin-engine.test.ts | ekop-pin |
| test/quant/foster-viswanathan-microstructure.test.ts | foster-viswanathan |
| test/quant/gkn-spread-engine.test.ts | gkn-spread |
| test/quant/glosten-harris-spread-engine.test.ts | glosten-harris-spread |
| test/quant/hasbrouck-var-engine.test.ts | hasbrouck-var |
| test/quant/huang-stoll-spread-engine.test.ts | huang-stoll-spread |
| test/quant/kyle-adverse-selection.test.ts | kyle-adverse-selection |
| test/quant/kyle-cross-asset-microstructure.test.ts | kyle-cross-asset |
| test/quant/madhavan-smidt-spread-engine.test.ts | madhavan-smidt-spread |
| test/quant/mrr-spread-decomposition-engine.test.ts | mrr-spread-decomposition |
| test/quant/rosu-orderbook-choice.test.ts | rosu-orderbook |
| test/quant/stoikov-microprice-engine.test.ts | stoikov-microprice |
| test/quant/v12-full-suite-simulation.test.ts | kyle-adverse-selection |
| test/quant/v13-full-suite-simulation.test.ts | cont-stoikov-lob |
| test/quant/v19-apex-suite-simulation.test.ts | stoikov-microprice |
| test/quant/v22-apex-suite-simulation.test.ts | mrr-spread-decomposition |
| test/quant/v25-apex-suite-simulation.test.ts | gkn-spread |
| test/quant/v26-apex-suite-simulation.test.ts | madhavan-smidt-spread |
| test/quant/v60-apex-suite-simulation.test.ts | bessembinder-kaufman |
| test/quant/v61-apex-suite-simulation.test.ts | chordia-trading-activity |

Total test files: **25** (lô 5: 24, lô 6: 1 — v13 imports `cont-stoikov-lob-types`).

# 02 — Strategy Identity Forensics

**Artifact:** `artifacts/strategy_identity_assessment.json` (SHA-256 `13eb0708cc0629757de69b94c45b44d79d784400c03347bbd8c5f136c9a5c351`)
**Mandatory Economic Identity Verdict:** `ECONOMICALLY_DIFFERENT`
**`H3_MAKER` Bot Runtime Applicability:** `NOT_VERIFIED`
**G13 Paper-Forward Harness Status:** `TWO_LEG_BASIS_CARRY_WITHOUT_BORROW_OR_LIQUIDATION_MODEL`

## 1. Nine-Stage Forensic Trace

| Stage | Python Lab (`verification_lab/strategies/h3_basis_carry.py`) | TS G13 Harness (`src/tree/paper-forward/paper-forward-runner.ts`) | TS Bot Runtime (`src/tree/bot/strategies/h3-maker.ts`) |
| --- | --- | --- | --- |
| 1. Hypothesis | Two-leg delta-neutral spot-long + perp-short funding/basis carry (`H3_MAKER`) | Two-leg delta-neutral spot-long + perp-short carry driven by signed spec | Single-leg directional spot price momentum proxy |
| 2. Data | Daily (`1d`) spot OHLCV, perp OHLCV, and funding rate panel (19-symbol universe) | Daily (`1d`) spot mid, perp mid, and funding intervals (`PaperForwardDayInput`) | Live/paper single-symbol ticker stream (`onTicker(ticker: Ticker)`, line 80) |
| 3. Signal | Causal 30-day rolling annualized funding/basis hurdle (`entryAnnualBps=800`, `exitAnnualBps=150`) | Consumes causal target weights from signed spec (`assertValidSignedStrategySpec`, line 56) | `computeAnnualizedCarryBps()` (lines 22–27): `((latestPrice - anchor) / anchor) * (365 / spanDays) * 10_000` — pure spot price drift, zero perp/funding input |
| 4. Strategy Spec | `artifacts/signed_strategy_spec_h3_maker.json` (`payloadSha256: 43ac1c5bec68810391da6d366156b933369dada96631fe0c54d66c376ef94169`) | Enforces `signed_strategy_spec_h3_maker.json` + registry SHA-256 parity | Accepts `H3MakerBotConfig` without verifying signed spec or two-leg capability |
| 5. Risk Authorization | `maxGrossLeverage=1.0`, delisted settlement flatten | `CapitalProtectionEngine` (`marketNeutralMode: true`, soft DD 8%, hard DD 12%, daily loss 2.5%, stale 15s) | `SINGLE_PAIR_MAX_NAV_FRACTION = 0.2` (line 15), `PAPER_ONLY` check (lines 49–51) |
| 6. Order Intents | Paired spot-long + perp-short maker limit orders (`fifoFillProbability=0.55`, `singleLegMissProbability=0.375`) | Paired two-leg orders via `executeH3MakerSymbolStep` (`paper-forward-pair-executor.ts`) | Single-leg spot `BUY` / `SELL` order only (`positionSide: 'flat' | 'long'`, line 38) |
| 7. Simulated Fills | Maker/taker fee schedule (`spotMakerBps=4`, `spotTakerBps=7`, `perpMakerBps=1.5`, `perpTakerBps=4.5`, `adverseSelectionBps=3.2334`) | `PaperOrderLifecycleEngine` two-leg fills with deterministic PRNG | Single-leg `callbacks.placeOrder` fill; no perp hedge leg |
| 8. Position Ledger | Daily portfolio weights and returns (no borrow APR or margin liquidation model) | `MicroDoubleEntryLedger` (spot + perp legs + `settlePerpFundingIntervals`; no borrow APR or liquidation model) | In-memory single scalar `positionQty` / `entryPrice` (lines 39–40) |
| 9. Net PnL | Funding carry + basis convergence minus two-leg fees/adverse selection | Spot MTM + perp MTM + funding cash flows minus two-leg fees | Directional spot price appreciation/depreciation minus single-leg spot fees |

## 2. Explicit Answers to the Ten Economic Identity Questions

1. **Are the traded instruments identical?** No. Python Lab and G13 Harness trade paired Spot + Perpetual futures across 19 symbols; `h3-maker.ts` trades a single spot symbol.
2. **Is the market-neutral hedge executed?** No in `h3-maker.ts` (zero perp short leg); yes in Python Lab and G13 Harness.
3. **Is funding rate accrual the primary return driver?** Yes in Python Lab and G13 Harness; no in `h3-maker.ts`, which has zero funding input and computes annualized spot price return (`lines 22–27`).
4. **Are entry/exit signals mathematically equivalent?** No. `h3-maker.ts` substitutes spot price momentum for annualized funding/basis carry.
5. **Is the fee and settlement model equivalent?** No. Python Lab and G13 Harness use `two_leg_spot_perp_maker_taker`; `h3-maker.ts` uses `single_leg_spot`.
6. **Is bar granularity aligned?** Daily (`1d`) in Python Lab and G13 Harness; tick/callback-driven windowing in `h3-maker.ts`.
7. **Is borrow/financing cost modeled?** No in all three surfaces (explicitly surfaced in G6 audit: Binance turns negative at 5% borrow APR, Hyperliquid turns negative at 10% borrow APR).
8. **Is margin liquidation modeled?** No in all three surfaces (explicitly modeled only in G6 independent Decimal oracle `G6-FM-10`).
9. **Can `H3_MAKER` research approval be transferred to `src/tree/bot/strategies/h3-maker.ts`?** No. Transferring market-neutral funding-carry research approval to a directional single-leg spot bot is economically invalid and now blocked fail-closed by `evaluateStrategyIdentityGate()`.
10. **Were historical records mutated?** No. `artifacts/signed_strategy_spec_h3_maker.json` and `artifacts/strategy_lifecycle_registry.json` remain byte-identical; the forensic finding is recorded append-only in `artifacts/strategy_identity_assessment.json`.

## 3. Strategy Identity Matrix

| Dimension | Python Lab (`h3_basis_carry.py`) | TS G13 Harness (`paper-forward-runner.ts`) | TS Bot Runtime (`h3-maker.ts`) |
| --- | --- | --- | --- |
| Legs | `2` (Spot + Perp) | `2` (Spot + Perp) | `1` (Spot only) |
| Structure | `market_neutral` | `market_neutral` | `directional` |
| Funding Accrual | Yes | Yes | No |
| Hedge Execution | Yes | Yes | No |
| Borrow Financing | No | No | No |
| Fee / Settlement Model | `two_leg_spot_perp_maker_taker` | `two_leg_spot_perp_maker_taker` | `single_leg_spot` |
| Bar Granularity | `1d` | `1d` | `1d` (windowed ticks) |
| Execution Mode | Offline Research | `PAPER_ONLY` | `PAPER_ONLY` |
| Identity vs Lab | Reference | Matches 2-leg structure (missing borrow/liquidation) | **`ECONOMICALLY_DIFFERENT`** |

## 4. `H3_BASIS_CARRY_V2` Separation

Because the `H3_MAKER` holdout (`n_trades=3`, `579d`) is already inspected and underpowered, and because `h3-maker.ts` is economically different, any future two-leg basis-carry candidate is formally separated under `strategy_id: "H3_BASIS_CARRY_V2"` with:
- `research_status: "PENDING_FRESH_OOS"`
- `paper_forward_allowed: false`
- `live_order_authority: false`
- `exposed_holdout_quarantined: true`

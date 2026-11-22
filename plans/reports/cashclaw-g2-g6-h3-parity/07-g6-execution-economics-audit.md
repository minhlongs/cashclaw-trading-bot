# 07 — G6 Realistic Net Execution Economics Audit

**Artifact:** `artifacts/g6_independent_execution_audit.json` (SHA-256 `f16765240af0d947e51bdf87e1b9c6053e75f1dd3e539c6139bef0e401e00e2a`)
**Audit Script:** `verification_lab/scripts/audit_g6_execution_economics.py`
**Verdict:** `committed_tca_invariants_verified: true` | `decimal_oracle_zero_residual: true` | `external_parity_status: NOT_VERIFIED`

## 1. Independent Decimal Recomputation of Committed TCA (`artifacts/g6_execution_tca.json`)

Every committed expectancy and break-even multiple was independently recomputed in 28-digit `Decimal` (`ROUND_HALF_EVEN`) with `decimal_recomputation_parity_ok: true`. Negative findings are surfaced directly:

| Venue | Scope | Band | `n_trades` | Expectancy `1.0x` | Expectancy `1.5x` | Expectancy `2.0x` | Expectancy `3.0x` | Break-Even Multiple | Clears `2.0x`? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Binance | Full Sample | Floor | `9` | `+0.016496` | `+0.010200` | `+0.003904` | `-0.008687` | `2.3101x` | Yes |
| Binance | Full Sample | Ceiling | `9` | `+0.014932` | `+0.007854` | `+0.000776` | `-0.013380` | `2.0548x` | Yes |
| **Binance** | **Locked OOS** | **Floor** | **`3`** | `+0.002375` | `+0.001187` | **`-0.000002`** | **`-0.002379`** | **`1.9992x`** | **NO** |
| **Binance** | **Locked OOS** | **Ceiling** | **`3`** | `+0.001995` | `+0.000616`** | **`-0.000762`** | **`-0.003519`** | **`1.7236x`** | **NO** |
| Hyperliquid | Full Sample | Floor | `9` | `+0.018339` | `+0.012964` | `+0.007590` | `-0.003159` | `2.7061x` | Yes |
| Hyperliquid | Full Sample | Ceiling | `9` | `+0.016646` | `+0.010425` | `+0.004204` | `-0.008237` | `2.3379x` | Yes |
| Hyperliquid | Locked OOS | Floor | `3` | `+0.002823` | `+0.001859` | `+0.000894` | `-0.001035` | `2.4634x` | Yes |
| **Hyperliquid** | **Locked OOS** | **Ceiling** | **`3`** | `+0.002412` | `+0.001241` | **`+0.000071`** | **`-0.002269`** | **`2.0304x`** | **Yes (thin)** |

Key invariants verified:
- `binance_oos_2x_negative: true` (negative at both floor and ceiling)
- `hyperliquid_oos_2x_positive_thin_at_ceiling: true` (`+0.000071` expectancy, `2.0304x` break-even)
- `hyperliquid_oos_3x_negative: true`
- Sample size is small (`n_trades = 9` full sample, `n_trades = 3` locked OOS).

## 2. Independent Decimal Double-Entry Two-Leg Oracle (10/10 Failure Modes)

All 10 synthetic two-leg execution failure modes (`data_origin: SYNTHETIC_SOFTWARE_TEST_FIXTURE`, 28-digit `Decimal`, `ROUND_HALF_EVEN`, passive maker zero-half-spread enforcement) reconciled with **`0.00000000` USD residual** (`10/10`):

| Scenario ID | Failure Mode | Hold Days | Net PnL (USD) | Residual (USD) |
| --- | --- | --- | --- | --- |
| `G6-FM-01` | `spot_fills_perp_misses_emergency_unwind` | `0.00017361` | `-54.96123782` | `0.00000000` |
| `G6-FM-02` | `perp_fills_spot_misses_emergency_cover` | `0.00017361` | `-47.02800000` | `0.00000000` |
| `G6-FM-03` | `one_leg_partial_fill_delta_rebalance` | `1.00000579` | `-30.22787095` | `0.00000000` |
| `G6-FM-04` | `venue_disconnect_forced_taker_exit` | `3.00004630` | `-45.08790247` | `0.00000000` |
| `G6-FM-05` | `funding_reverses_negative_carry_bleed` | `10.00000579` | `-75.69863807` | `0.00000000` |
| `G6-FM-06` | `basis_divergence_mtm_drawdown` | `5.00000579` | `-108.92332300` | `0.00000000` |
| `G6-FM-07` | `spread_expansion_shock` | `2.00000579` | `-132.73973396` | `0.00000000` |
| `G6-FM-08` | `liquidity_collapse_market_impact` | `4.00000579` | `-125.47945999` | `0.00000000` |
| `G6-FM-09` | `emergency_exit_failure_retry_ladder` | `2.00040509` | `-74.52728095` | `0.00000000` |
| `G6-FM-10` | `liquidation_pressure_margin_breach` (`50 bps` liq fee = `$57.6875`) | `7.00001157` | `-141.15311389` | `0.00000000` |

## 3. Venue-Calibrated Borrow APR Sensitivity

Calibrated against venue funding APR (`binance: 4.4275%`, `hyperliquid: 9.8435%`), all rows reconciled with `0.00000000` residual:

| Borrow APR | Binance Net PnL (USD) | Binance Positive? | Hyperliquid Net PnL (USD) | Hyperliquid Positive? |
| --- | --- | --- | --- | --- |
| `0%` | `+107.33741096` | Yes | `+288.33727945` | Yes |
| `5%` | **`-47.75848738`** | **NO** | `+133.24138111` | Yes |
| `10%` | **`-202.85438572`** | **NO** | **`-21.85451723`** | **NO** |
| `20%` | **`-513.04618241`** | **NO** | **`-332.04631392`** | **NO** |

## 4. External Engine Parity

- `NautilusTrader`: **`NOT_VERIFIED`**
- `HftBacktest`: **`NOT_VERIFIED`**
- Neither engine is installed or executed in this offline audit environment.

# 10 — Scientific Falsification Gate (`N = 201` Cumulative Family Trials)

Evaluated strictly causally (30-day rolling funding > 8% APR entry threshold, 60% cash-funded spot leg, 4.00% cash opportunity cost, 33 bps RT 1× friction / 66 bps RT 2× friction, 4 rebalances/yr) on local historical parquets (`HASH_RECORDED_UNVERIFIED` — non-authoritative for promotion, sufficient for falsification):

| Metric | Binance BTC (`2,099` days) | Hyperliquid BTC (`731` days) |
| --- | ---: | ---: |
| **Dataset Provenance** | `HASH_RECORDED_UNVERIFIED` | `HASH_RECORDED_UNVERIFIED` |
| **Cumulative Family Trials (`N`)** | `201` (`186 + 15`) | `201` (`186 + 15`) |
| **V3 Gross Annualized Return** | `4.13%` | `4.88%` |
| **V3 Net Return (1× Cost)** | `3.88%` | `4.41%` |
| **V3 Net Return (2× Cost)** | `3.62%` | `3.93%` |
| **Cash Benchmark (4.00% APR)** | `4.00%` | `4.00%` |
| **Excess over Cash (1× Cost)** | **`-0.12%`** | **`0.41%`** |
| **Excess over Cash (2× Cost)** | **`-0.38%`** | **`-0.07%`** |
| **Risk-Matched BTC Buy & Hold** | `0.30%` | `0.11%` |
| **Funding-Only Baseline (Always On, 60%)** | `5.89%` | `6.07%` |
| **Excess Sharpe (1× / 2×)** | `-0.23` / `-0.72` | `1.15` / `-0.21` |
| **Deflated Sharpe Ratio (`N=201`)** | **`0.000459`** (< 0.95 FAIL) | **`0.127139`** (< 0.95 FAIL) |
| **Randomized-Entry p-value** | `0.0020` | `0.0020` |
| **G5 Statistical Verdict** | **`FALSIFIED_OR_INSUFFICIENT_EXCESS_CARRY`** | **`FALSIFIED_OR_INSUFFICIENT_EXCESS_CARRY`** |

**Core Falsification Finding:** Because cash-funded V3 can only deploy **60% of equity** into the funding-earning spot/perp pair (holding 40% in perp margin + free reserve to avoid Portfolio Margin and liquidation), a ~10% historical BTC funding rate yields only ~4.1–4.9% gross on total equity when filtered by the 30-day entry rule. After 2× execution friction and a 4.00% cash opportunity cost, **excess carry turns negative on BOTH venues (`-0.38%` Binance, `-0.07%` Hyperliquid)** and **DSR collapses (`0.0005` / `0.1271` vs `0.95` gate)** at `N = 201`.

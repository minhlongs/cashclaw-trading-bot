# 05 — Route C: Cross-Venue (`Binance BTC/USDT Spot` + `Hyperliquid BTC-PERP`)

- **Route Verdict:** **`UNVERIFIED_MARKET_ACCESS`** (Economically **INFEASIBLE** at `$100–$1,000` and fails 2× stress at `$5,000`)
- **Structural Penalties:** Dual custody (Binance CEX + Hyperliquid), non-fungible margin (separate pre-funded USDT on Binance and USDC on Hyperliquid), USDT/USDC FX basis, `$2.50` per-way transfer friction (`$5.00` RT), and `150 bps/yr` operational/outage penalty.
- **Result:** `$100`, `$500`, and `$1,000` tiers all produce **negative excess carry** (`-$4.88`, `-$4.39`, `-$3.77` over 90d), and `$5,000` turns negative under 2× execution friction (`-$4.45`). Route C is rejected for small capital.

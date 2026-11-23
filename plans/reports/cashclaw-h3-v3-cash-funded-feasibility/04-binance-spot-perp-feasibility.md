# 04 — Route B: Binance Same-Venue (`BTC/USDT` Spot + `BTC/USDT` Perp)

- **Route Verdict:** **`UNVERIFIED_MARKET_ACCESS`** (`VENUE_ACCESS_NOT_VERIFIED`)
- **Spot Metadata (`/api/v3/exchangeInfo`):** `BTCUSDT` `TRADING`; `LOT_SIZE minQty=0.00001`, `stepSize=0.00001`; `NOTIONAL minNotional=$5.00`; L1 bid `$61,510.39` / ask `$61,510.40`.
- **Perp Metadata (`/fapi/v1/exchangeInfo`):** `BTCUSDT` `TRADING`; `LOT_SIZE minQty=0.001` (~`$61.47`), `stepSize=0.001`; `MIN_NOTIONAL=$50.00`; `maintMarginPercent=2.5000`, `requiredMarginPercent=5.0000`; L1 bid `$61,476.70` / ask `$61,476.80`; mark `$61,471.09`, index `$61,507.88`, `lastFundingRate=0.00004125` (`451.69 bps` APR).
- **Key Mechanical Finding:** Because Binance USD-M `BTCUSDT` perp enforces `minQty = 0.001 BTC` (~`$61.47`) and `stepSize = 0.001 BTC`, the **`$100` tier is strictly infeasible** under the 60%/15%/25% cash-funded policy (`$60 < $61.47`), and `$500`–`$1,000` tiers suffer coarse `0.001 BTC` (`~$61.50`) lot quantization.
- **Access Constraint:** Zero account APIs or credentials were used; geographic and KYC eligibility for Binance USD-M derivatives is unverified -> strictly classified `VENUE_ACCESS_NOT_VERIFIED`.

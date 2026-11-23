# 03 — Route A: Hyperliquid Same-Venue (`UBTC/USDC` Spot + `BTC-PERP`)

- **Route Verdict:** **`MECHANICALLY_FEASIBLE`**
- **Spot Token Identity (Live `spotMetaAndAssetCtxs`):** `UBTC` (`fullName: "Unit Bitcoin"`, `token_index: 197`, on-chain HyperCore spot token hex `0x8f254b96...aa137c67`, `szDecimals: 5`, `isCanonical: false`, `evmContract: 0x9fdbda0a5e284c32744d2f17ee5c74b284993463`)
- **Spot Order Book Universe:** `@142` (`tokens: [197, 0]`, `dayNtlVlm: $40.09M`, L1 bid `$61,415.00` × `1.547 BTC` / ask `$61,416.00` × `0.860 BTC`, spread `0.16 bps`)
- **Perp Order Book:** `BTC` (`szDecimals: 5`, `maxLeverage: 40`, `dayNtlVlm: $3.90B`, L1 bid `$61,492.00` / ask `$61,493.00`, mark `$61,494.00`, oracle `$61,511.90`)
- **Observed Spot/Perp Basis:** UBTC mid `$61,415.50` vs BTC-PERP mark `$61,494.00` = **`+12.78 bps`**; UBTC mid vs BTC oracle `$61,511.90` = **`-15.67 bps`** (wrapped-BTC discount).
- **Tier 0 Fees (Verified Docs):** Spot `4.0 / 7.0 bps` (maker/taker); Perp `1.5 / 4.5 bps` (maker/taker). Note: `deployerTradingFeeShare: "1.0"` on `UBTC`.
- **Unified Account vs Portfolio Margin:** Unified Account shares one USDC balance across spot and USDC-margined perps without Portfolio Margin, **avoiding the `>$10k / >$5M` PM gate**, but does **not** cross-collateralize spot UBTC to margin BTC-PERP. Therefore cash-funded V3 must hold explicit USDC for perp IM (`15%`) and free reserve (`25%`), capping spot exposure at `60%`.
- **Wrapper Risk:** UBTC is Unit Protocol bridged BTC (`isCanonical: false`), not native L1 BTC. A `50 bps/yr` operational haircut and a `5%` depeg stress scenario are applied consistently in both `capital_matrix.py` and `stress_and_falsification.py`.

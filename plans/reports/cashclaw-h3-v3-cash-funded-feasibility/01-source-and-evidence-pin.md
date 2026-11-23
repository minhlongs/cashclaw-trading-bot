# 01 — Source Integrity & Evidence Pin (CASHCLAW #28)

- **Repository:** `minhlongs/cashclaw-trading-bot`
- **Baseline `origin/main` SHA:** `da00705137f40ddd714c3ae490c6efbe67047cdd` (PR #74)
- **Feature Branch:** `research/h3-v3-cash-funded-feasibility` (isolated worktree `/tmp/cashclaw-28-v3-wt`)
- **Protected Checkout (`/Users/macbook/trade-bot`):** Untouched (pre-run status SHA `58d1f1c6b216e176e2e63c62128e1f9e5b1c50329d54afc64000f14969fece72`, 14 user-owned files preserved)
- **Machine-Readable Manifest SHA-256:** `22a5b48f2b25e636e41f8260d2a14f065844e7c229b0ec700dbfbeb6ddce8b8c`

## Immutable V2 & Governance Anchors (Verified Exact)

| Anchor | SHA-256 / State | Status |
| --- | --- | --- |
| V2 OOS Registration | `c089527416420ac11dfea01a2ad7ca0b18a167ad13bb775575af5b1ef70d0012` | **EXACT / UNCHANGED** |
| V2 Frozen Spec (Canonical) | `187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53` | **EXACT / UNCHANGED** |
| V2 Evidence Erratum v1 | `9dd9def3271d756dca30bdfae044befb96059d7d94f10d97f0d527fb7a577a01` | **EXACT / UNCHANGED** |
| V2 Observation Contract | `6c2e67d3ed0049a175a97c493a362272516b6b644fa0e1d0f04f4993bc2cfc21` | **EXACT / UNCHANGED** |
| G13 Checkpoint Chain | `eca612906239b29ef3df79846eae627e58616a8be85b070626a59b4f95e94ad9` | **UNTOUCHED** |
| G15 Hard Lock | `src/tree/paper-forward/tracking-error-reconciler.ts:122` (`liveTradingUnlocked: false`) | **HARD-LOCKED** |

## Forensic Cross-Reference to CASHCLAW #27 P1 Findings

Retained diagnostic evidence at `/Users/macbook/.cashclaw-diagnostics/cashclaw-27-20261123/` was inspected strictly read-only. Both P1 findings are formally cross-referenced and blocked in `verification_lab/src/verification_lab/v3/causal_provenance.py`:

1. **CC27-P1-A (Granularity Mismatch):** `HyperliquidReadOnlyAdapter` recorded an intraday `05:45:35Z` snapshot and annualized a single 1h funding print under `bar_granularity: "1d"`. V3 `validate_v3_composite_causality()` fails closed with `MIXED_GRANULARITY_MISALIGNMENT` whenever non-`1d_finalized` inputs enter a daily observation.
2. **CC27-P1-B (Composite Availability Preceding Borrow Capture):** Composite `available_at_utc` copied `l2Book.time` (`05:45:35.037Z`) ahead of timestamp-less borrow capture (`05:45:36.813Z`). V3 enforces `composite_available_utc = max(latest_defensible_available_utc)` and rejects any earlier claim with `COMPOSITE_AVAILABLE_PRECEDES_LATEST_COMPONENT`.
3. **Separate Collector Remediation:** V2 collector remediation is deferred to a separate PR so frozen V2 evidence remains completely untouched.

## Bounded Public Read-Only Venue Probes (`2026-11-23`, Zero Credentials)

| Probe | Endpoint | HTTP | Bytes | SHA-256 Prefix |
| --- | --- | ---: | ---: | --- |
| `hl_spot_meta_and_ctxs` | `POST https://api.hyperliquid.xyz/info` | `200` | `366199` | `af2fc66adf89684c...` |
| `hl_l2_ubtc_spot` | `POST https://api.hyperliquid.xyz/info` | `200` | `1564` | `4b0eb6ff1b4910df...` |
| `hl_perp_meta_and_ctxs` | `POST https://api.hyperliquid.xyz/info` | `200` | `72787` | `8d95fd025e0c2780...` |
| `hl_l2_btc_perp` | `POST https://api.hyperliquid.xyz/info` | `200` | `1579` | `4556f1a40e5102d8...` |
| `hl_funding_btc_7d` | `POST https://api.hyperliquid.xyz/info` | `200` | `15084` | `db5e0800ba53a8b2...` |
| `bn_spot_exchange_info_btcusdt` | `GET https://api.binance.com/api/v3/exchangeInfo?symbol=BTCUSDT` | `200` | `5428` | `7ca4e4254ede9d87...` |
| `bn_spot_book_ticker_btcusdt` | `GET https://api.binance.com/api/v3/ticker/bookTicker?symbol=BTCUSDT` | `200` | `120` | `e25cd16185450a25...` |
| `bn_fapi_exchange_info` | `GET https://fapi.binance.com/fapi/v1/exchangeInfo` | `200` | `1189718` | `90c99cae8f99ee30...` |
| `bn_fapi_book_ticker_btcusdt` | `GET https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=BTCUSDT` | `200` | `149` | `b1c8cd4cdfc2378f...` |
| `bn_fapi_premium_index_btcusdt` | `GET https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT` | `200` | `231` | `30547e9513942717...` |
| `bn_fapi_funding_rate_btcusdt` | `GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=100` | `200` | `12609` | `63c26c0b921ab324...` |

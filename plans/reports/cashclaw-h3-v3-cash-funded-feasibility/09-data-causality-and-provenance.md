# 09 — Data Provenance & Causal Validation

- **Historical Datasets (`spot_1d.parquet`, `perp_1d.parquet`, `funding.parquet`, `hyperliquid_funding_1h.parquet`):** Retained strictly as **`HASH_RECORDED_UNVERIFIED`** (`independent_authenticity_proven: false`). Never upgraded.
- **Live Venue Probes (`/Users/macbook/.cashclaw-diagnostics/cashclaw-28-20261123/`):** Classified **`SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED`** (11 raw `.bin` files + SHA-256 manifest).
- **Causal Contract (`verification_lab/src/verification_lab/v3/causal_provenance.py`):**
  - Enforces `composite_available_utc = max(latest_defensible_available_utc)` across all inputs (closes CC27-P1-B).
  - Rejects mixed `1d_finalized` vs intraday inputs (closes CC27-P1-A).
  - Rejects oracle spot references masquerading as executable spot books (`ORACLE_SPOT_PROXY_REJECTED`).
  - Rejects `< 30` days lookback without fabricating history (`INSUFFICIENT_LOOKBACK_DAYS`).

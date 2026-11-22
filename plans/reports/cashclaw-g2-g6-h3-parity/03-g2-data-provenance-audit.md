# 03 — G2 Point-in-Time Data Provenance Audit

**Artifact:** `artifacts/g2_data_provenance.json` (SHA-256 `9ccf0b84cf585f24451b279abd0cf89a0350f1b5b18594ef82e4862ce6643599`)
**Audit Script:** `verification_lab/scripts/audit_g2_data_provenance.py`
**Verdict:** `provenance_manifest_verified: true` | `synthetic_validators_passed: true` | `raw_local_data_status: BLOCKED_MISSING_DATA`

## 1. Committed Provenance Parquet Verification

Audited `artifacts/g2_data_provenance.parquet` (SHA-256 `95b91ca8040c19026f7dac061d7e5d8c2829fd3dfa6925e9424958933859149f`, `341,957` bytes):

| Metric | Verified Value |
| --- | --- |
| Row Count | `7,808` |
| Column Count | `17` (`dataset`, `symbol`, `month`, `url`, `retrieved_at`, `zombie_bars_filtered`, `checksum_verified`, `is_delisted`, `last_active_ts_ms`, `available_at_utc`, `cache_hit`, `bytes`, `sha256`, `rows`, `first_ts_ms`, `last_ts_ms`, `status`) |
| Distinct Symbol Entries | `24` (23 Binance symbols + `ALL_19` Hyperliquid aggregate) |
| Delisted Symbols Included | `4` (`EOSUSDT`, `FTMUSDT`, `MATICUSDT`, `MKRUSDT`) |
| Status Breakdown | `ok: 7,380`, `http_404: 352`, `empty: 76` |
| `available_at_utc` Completeness | `7,380 / 7,808` (`94.5184%`; 100% of `ok` rows) |
| `checksum_verified` | `verified_true: 12`, `verified_false: 7,796` (`0.1537%`) |
| Zombie Bars Filtered | `7,631` total across `82` rows |
| Dataset Breakdown | `funding: 1,610`, `perp_1d: 1,610`, `perp_4h: 1,610`, `spot_1d: 1,610`, `oi_metrics: 1,357`, `hyperliquid_funding_1h: 10`, `hyperliquid_l1_quotes: 1` |

## 2. Synthetic Edge-Case Validation (9/9 Pass, Zero False Positives)

Every synthetic validator (`data_origin: SYNTHETIC_SOFTWARE_TEST_FIXTURE`) passed both defect detection and clean-control zero-false-positive verification:

| Case ID | Edge Case | Result | Clean Control Zero FP | Key Evidence |
| --- | --- | --- | --- | --- |
| `G2-EC-01` | `missing_candles` | PASS | `true` | Detected 2-bar gap (`259,200,000 ms`) and sub-step irregular interval (`129,600,000 ms`) |
| `G2-EC-02` | `timestamp_collisions` | PASS | `true` | Detected duplicate timestamp `1704070800000` |
| `G2-EC-03` | `stale_observations` | PASS | `true` | Detected `age_ms: 28,800,000` exceeding `max_age_ms: 14,400,000` |
| `G2-EC-04` | `reordered_funding_events` | PASS | `true` | Detected out-of-order funding event (`1704081600000 < 1704096000000`) |
| `G2-EC-05` | `funding_interval_1h_and_8h` | PASS | `true` | Validated Binance 8h, Hyperliquid 1h, and caught cross-interval mismatch |
| `G2-EC-06` | `historical_pair_selection` | PASS | `true` | PIT early `[BTCUSDT, EOSUSDT]` vs PIT late `[BTCUSDT, NEWCOINUSDT]` |
| `G2-EC-07` | `delisted_markets_zombie_bars` | PASS | `true` | Caught 2 post-delisting zombie bars after `1706659200000` |
| `G2-EC-08` | `data_revisions_sha256_mismatch` | PASS | `true` | Caught SHA-256 digest mutation |
| `G2-EC-09` | `missing_open_interest_periods` | PASS | `true` | Caught missing `2021-02` OI month (`2/3` present) |

## 3. Explicit `BLOCKED_MISSING_DATA` Accounting

Six gitignored raw/normalized local dataset files are absent from this offline worktree:
- `verification_lab/data/normalized/spot_1d.parquet`
- `verification_lab/data/normalized/perp_1d.parquet`
- `verification_lab/data/normalized/perp_4h.parquet`
- `verification_lab/data/normalized/funding.parquet`
- `verification_lab/data/normalized/oi_metrics.parquet`
- `verification_lab/data/raw/g13_day0_snapshot.json`

This causes exactly **5 Python tests** to report `BLOCKED_MISSING_DATA` (with 170/175 passing and 0 regressions):
1. `verification_lab/tests/test_g13_bridge_cli.py::test_multiday_ts_reconciliation_bridge_progression_and_fail_closed_tamper_guards`
2. `verification_lab/tests/test_g13_bridge_cli.py::test_geoblock_http_451_fallback_and_missing_parquet_ci_resilience`
3. `verification_lab/tests/test_issue59_extensions.py::test_committed_provenance_has_zero_hard_errors_verified_uniusdt_checksum_and_oi`
4. `verification_lab/tests/test_issue59_extensions.py::test_h3_maker_flattens_delisted_positions_on_settlement_across_entire_maker_grid`
5. `verification_lab/tests/test_issue63_calibration_and_g13.py::test_committed_g13_artifact_is_honestly_day0_inconclusive_and_offline_safe`

No synthetic data was substituted for missing empirical parquets. Restoring these 6 files from the verified archive is required before any empirical `H3_BASIS_CARRY_V2` evaluation.

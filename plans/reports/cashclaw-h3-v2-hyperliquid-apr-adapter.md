# CASHCLAW #25 — Hyperliquid Public Borrow-Rate Adapter Report

**Status:** `READY_FOR_FOUNDER_APR_ADAPTER_REVIEW`
**Strategy:** `H3_BASIS_CARRY_V2`
**Prospective Registration Start:** `2026-11-23T00:00:00Z`
**Branch:** `research/h3-v2-hyperliquid-borrow-apr`
**Base Commit (`origin/main`):** `3b86b2e3e7eb8793d5581fbf0ccda9368021b7f1` (PR #73 squash merge)
**Execution Mode:** Paper-only, read-only, non-custodial, zero trading authority

---

## 1. Executive Summary

Implemented a public, credential-free Hyperliquid read-only USDC borrow-rate adapter (`verification_lab/src/verification_lab/oos/hyperliquid_borrow_rate.py`) and integrated it into the PR #73 passive OOS evidence pipeline (`adapters.py`, `pipeline.py`, `offline_replay.py`, `__init__.py`, `collect_h3_v2_passive_oos.py`). The adapter queries Hyperliquid's official public read-only endpoints (`POST https://api.hyperliquid.xyz/info` with `{"type": "spotMeta"}` and `{"type": "allBorrowLendReserveStates"}`), resolves USDC dynamically without hardcoding index `0`, parses all numeric fields in exact `Decimal` (rejecting binary floats, `NaN`, and `Infinity`), verifies utilization and reserve-balance consistency against Hyperliquid's documented Portfolio Margin borrowing formula, preserves the raw `borrowYearlyRate` separately from derived nominal APR, records strict causal timestamps without inventing exchange publication timestamps, persists raw HTTP payloads in the append-only SHA-256 hash-chained evidence store, and verifies everything independently in second-path offline replay.

Binance remains strictly out of scope and continues to fail closed with `INELIGIBLE_MISSING_VENUE_BORROW_APR` when venue-observed borrow APR is unavailable. No automated daily loop, cron job, LaunchAgent, GitHub Actions schedule, Cloudflare deployment, D1 migration, or order-capable code was added or activated.

---

## 2. Source Pin & Immutable Anchor Verification

Verified in isolated worktree `/Users/macbook/orca/workspaces/trade-bot/h3-v2-hl-borrow-apr` branched from `origin/main` (`3b86b2e3e7eb8793d5581fbf0ccda9368021b7f1`). The developer's original checkout at `/Users/macbook/trade-bot` (14 modified user-owned files) was never touched, reset, stashed, or mutated.

| Artifact | Verified SHA-256 | Match |
| --- | --- | --- |
| Prospective Registration (`artifacts/h3_basis_carry_v2_prospective_oos_registration.json`) | `c089527416420ac11dfea01a2ad7ca0b18a167ad13bb775575af5b1ef70d0012` | EXACT |
| Frozen Strategy Spec (`H3_BASIS_CARRY_V2`) | `187e1974069bc1d70950b475804b670a8510a413411652c2c71b1e370b22ee53` | EXACT |
| Evidence Erratum v1 (`artifacts/h3_basis_carry_v2_evidence_erratum_v1.json`) | `9dd9def3271d756dca30bdfae044befb96059d7d94f10d97f0d527fb7a577a01` | EXACT |
| Observation Contract (`artifacts/h3_basis_carry_v2_prospective_observation_contract.json`) | `6c2e67d3ed0049a175a97c493a362272516b6b644fa0e1d0f04f4993bc2cfc21` | EXACT |

---

## 3. Official Source Contract & Live Diagnostic Probe

One bounded, manual, read-only `DIAGNOSTIC_CONNECTIVITY_PROBE` was executed against `POST https://api.hyperliquid.xyz/info` on `2026-11-23` (stored only in `/tmp/hl_borrow_probe_261123/`, not committed to Git, 0 OOS days incremented):

- **`spotMeta`**: HTTP `200`, `144,012` bytes, SHA-256 `01feb4313be53af202b92a44ec94b4979a2ea3ab8f3e330a1def94df23f46a8c`, HTTP `Date: Mon, 23 Nov 2026 04:29:54 GMT`. Returned 520 tokens with a single canonical `USDC` entry at `index: 0`, `szDecimals: 8`, `weiDecimals: 8`, `isCanonical: true`.
- **`allBorrowLendReserveStates`**: HTTP `200`, `1,091` bytes, SHA-256 `c17deabbca3eba503c84f349792e0c02fcdef23b16767d0f7a2f7f5b27cdfb70`, HTTP `Date: Mon, 23 Nov 2026 04:29:55 GMT`. Returned 5 reserve entries. Token `0` (`USDC`) reported:
  - `borrowYearlyRate`: `"0.05"`
  - `supplyYearlyRate`: `"0.0259134723"`
  - `utilization`: `"0.5758549404"`
  - `totalSupplied`: `"620840038.8991656303"`
  - `totalBorrowed`: `"357513803.5693222284"`
  - `balance`: `"263326361.4221327305"`
  - `oraclePx`: `"1.0"`
  - `ltv`: `"0.0"`

Dynamic `spotMeta` resolution verifies unique `name == "USDC"`, non-boolean integer `index`, `isCanonical is not False`, no duplicate token indices, and no silent substitution with `USDH`, `USDT`, or other stablecoins. Index `0` is recorded as `index_matches_historical_zero` metadata rather than assumed.

---

## 4. Rate Semantics & Exact Decimal Conversion

Per Hyperliquid's official Portfolio Margin documentation, borrow rates accrue continuously (indexed hourly) and are published via `borrowYearlyRate` as an annualized borrowing yield (`effective_apy`). The adapter preserves the raw quote separately from every derived quantity in `RateConversionResult`:

- `borrow_rate_raw`: exact `Decimal` string from `borrowYearlyRate` (never hardcoded, never passed through IEEE-754 `float`).
- `annualization_convention`: `HYPERLIQUID_PORTFOLIO_MARGIN_CONTINUOUS_APY` (or `RATE_CONVENTION_NOT_VERIFIED`).
- `effective_apy`: raw `borrowYearlyRate` (`0.0500000000` -> `500.000000` bps).
- `nominal_apr`: exact `Decimal` continuous conversion `ln(1 + effective_apy)` (`0.0487901642` -> `487.901642` bps for `borrowYearlyRate = 0.05`).
- `hourly_accrual_rate`: `nominal_apr / 8760`.
- `conversion_status`: `VERIFIED_CONTINUOUS_APY_TO_NOMINAL_APR` when convention is verified; otherwise `RATE_CONVENTION_NOT_VERIFIED`, which fails closed (`nominal_apr = None`, `borrow_apr_bps = None`, `eligible_for_borrow_input = False`).

---

## 5. Utilization & Reserve Consistency Verification

Implemented `validate_utilization_consistency()` in exact `Decimal`:

1. Documented borrowing formula check: `formula_rate = 0.05 + 4.75 * max(0, utilization - 0.8)` vs observed `borrowYearlyRate` (tolerance `0.0005`). Live probe: `observed = 0.05`, `formula = 0.05`, `diff = 0.0000000000`.
2. Utilization cross-check: `reported utilization` vs `totalBorrowed / totalSupplied` (tolerance `0.001`). Live probe: `diff = 4.65e-11`.
3. Reserve balance cross-check: `|balance - (totalSupplied - totalBorrowed)| / totalSupplied` (relative tolerance `0.01`). Live probe: `rel_diff = 2.03e-7`.

Any discrepancy is recorded in `discrepancy_reasons` and fails closed (`eligible_for_borrow_input = False`, `borrow_apr_bps = None`, `borrow_rate_source = BORROW_RATE_INVALID_OR_UNVERIFIABLE`).

---

## 6. Capital Economics Identity

The adapter preserves strict separation in `capital_economics_metadata`:

- `venue_observed_borrow_apr_bps` and `venue_observed_effective_apy_bps` are venue-quoted rates.
- `frozen_v2_financing_hurdle_role = "CONSERVATIVE_VENUE_BORROW_HURDLE"`.
- `cash_opportunity_cost_distinct_from_venue_borrow = True` (never relabels cash opportunity cost as venue borrowing).
- Explicit note that at 1.0x gross leverage with owned cash, actual venue loan principal may be `0`, while frozen V2 retains venue borrow APR as a conservative hurdle.
- Explicit Hyperliquid Portfolio Margin eligibility caveats (`>$5M` weighted volume or `>$10k` account value `<$25M` cap; `ltv = 0` on USDC itself).
- Frozen V2 strategy parameters are untouched; any alternative capital-structure specification belongs in a future Founder-reviewed V3 proposal.

---

## 7. Architecture & Module Integration

| File | Role |
| --- | --- |
| `verification_lab/src/verification_lab/oos/hyperliquid_borrow_rate.py` | New read-only borrow-rate module: `resolve_usdc_token`, `extract_usdc_reserve_state`, `compute_documented_formula_rate`, `validate_utilization_consistency`, `classify_and_convert_rate`, `validate_borrow_rate_causal_timestamps`, `build_borrow_rate_observation_from_envelopes`, `verify_saved_raw_borrow_evidence`, `HyperliquidBorrowRateAdapter`. |
| `verification_lab/src/verification_lab/oos/adapters.py` | Allowlisted `spotMeta` and `allBorrowLendReserveStates` POST types; hardened `_default_transport` (`session.trust_env = False`, `stream=True`, pre-buffer response-size cap, `allow_redirects=False`); added `requested_at_utc` + `http_date_utc` on `RawCaptureEnvelope`; integrated `fetch_public_borrow_rate` in `HyperliquidReadOnlyAdapter.capture_market_observation` (fetching all 5 HTTP envelopes before sampling `capture_dt`). |
| `verification_lab/src/verification_lab/oos/pipeline.py` | Added `BORROW_SOURCE_VENUE_OBSERVED_PUBLIC` and `BORROW_SOURCE_INVALID`; enforced strict venue isolation (zero cross-venue contamination), `INELIGIBLE_MISSING_VENUE_BORROW_APR`, causal timestamp re-validation against `evaluation_time_utc`, and raw-envelope hash presence for non-synthetic public venue borrow rates. |
| `verification_lab/src/verification_lab/oos/offline_replay.py` | Independent second-path re-parsing of saved raw `spotMeta` + `allBorrowLendReserveStates` files (token identity, `isCanonical`, unique indices, strict Decimal, utilization/balance consistency, rate convention, and `nominal_apr_bps` parity) without poisoning replay on legitimately rejected days. |
| `verification_lab/scripts/collect_h3_v2_passive_oos.py` | Wired Hyperliquid single-shot `capture-once` to fetch public borrow rate when `--borrow-apr-bps` is omitted; replaced `type=float` on `--borrow-apr-bps` with strict exact-Decimal non-negative parser. |
| `verification_lab/src/verification_lab/oos/__init__.py` | Exported public borrow-rate types, constants, and helpers. |

No competing observation validator was created. Zero trading SDKs (`ccxt`, `hyperliquid`, `binance`, `web3`, `eth_account`) are imported anywhere in `verification_lab/src/verification_lab/oos/`.

---

## 8. HTTP Security & Resilience Controls

- **HTTPS-only & exact allowlists:** Rejects non-HTTPS schemes, query/fragment/credentials/path traversal, unallowlisted hosts/paths, and unallowlisted Hyperliquid POST `type` values (`order`, `cancel`, `clearinghouseState`, `exchange`, unhashable values).
- **No redirects & no ambient credentials:** `allow_redirects=False`, explicit 3xx rejection in `fetch()`, `session.trust_env = False` (blocks `~/.netrc` and ambient proxy env vars), and forbidden headers (`authorization`, `x-api-key`, `x-mbx-apikey`, `x-hl-signature`, `cookie`).
- **Bounded resources & retries:** Streaming `max_response_bytes` cap (5 MiB default, enforced via `Content-Length` pre-check and chunked `iter_content` abort before buffering), finite positive `timeout_s`, bounded `max_retries` (0–5), safe `Retry-After` parsing (`NaN`/`Inf`/negative guarded, capped at 30s), and sanitized error URLs.

---

## 9. Causal Timestamp Validation & Provenance

Hyperliquid's `allBorrowLendReserveStates` response does not include a per-reserve publication timestamp. The adapter explicitly separates:

1. `market_rate_event_time_utc` (`None` — never invented)
2. `exchange_publication_time_utc` (`None` — never invented)
3. `http_response_date_utc` (parsed from HTTP `Date` header when present)
4. `local_request_time_utc` and `local_capture_time_utc`
5. `strategy_evaluation_time_utc`

- Default status when all local and HTTP `Date` causal checks pass: `LOCAL_CAPTURE_BOUNDED_NO_VENUE_PUB_TS`.
- Strict policy (`require_exchange_publication_timestamp=True`): fails closed with `BLOCKED_CAUSAL_PROVENANCE`.
- Rejects future captures (`cap_dt > eval_dt`), stale captures (`eval_dt - cap_dt > 300s`), stale or forward-skewed HTTP `Date` headers, and retroactive day reconstruction.
- `pipeline.py` independently re-validates borrow-rate causal timing against `evaluation_time_utc`.

---

## 10. Append-Only Evidence Ledger & Crash Safety

- All raw `spotMeta` and `allBorrowLendReserveStates` HTTP bytes are persisted via `AppendOnlyEvidenceStore` alongside SHA-256 hashes and chain links.
- Provenance label remains `SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED` (local checksum integrity is never promoted to externally authenticated historical proof).
- Verified crash-safety scenarios: interrupted WAL recovery, local disk write failure (`OSError` -> 0 eligible days), duplicate record rejection, corrupted/truncated hash-chain detection, tampered raw reserve bytes, mismatched token metadata, and verify-only replay immutability (zero ledger byte or timestamp mutation).

---

## 11. Passive Collector Integration & Safety Invariants

- Valid Hyperliquid public borrow capture -> `borrow_rate_source = VENUE_OBSERVED_PUBLIC_READ_ONLY`.
- Missing borrow rate -> `SIGNAL_NOT_EVALUABLE_MISSING_DATA` + `INELIGIBLE_MISSING_VENUE_BORROW_APR`.
- Invalid/inconsistent borrow rate -> `BORROW_RATE_INVALID_OR_UNVERIFIABLE`.
- Manual `--borrow-apr-bps` -> `MANUAL_ASSUMPTION_NOT_VENUE_OBSERVED` (never qualifies prospective OOS days).
- Maintained invariants: `completed_executed_paper_trades = 0`, `paper_forward_allowed = false`, `live_order_authority = false`, `g13_status = UNTOUCHED`, `g15_status = HARD-LOCKED`.

---

## 12. Binance Strict Out-of-Scope Isolation

- Zero authenticated Binance margin APIs, zero API keys requested, zero permission changes.
- `BinanceReadOnlyAdapter` continues to leave `borrow_apr_bps = None` and fail closed with `INELIGIBLE_MISSING_VENUE_BORROW_APR`.
- Cross-venue substitution (attaching Hyperliquid borrow evidence or `VENUE_OBSERVED_PUBLIC_READ_ONLY` to a Binance observation) is explicitly rejected with `cross_venue_borrow_rate_contamination_forbidden`.

---

## 13. Adversarial & Regression Test Coverage

`verification_lab/tests/test_hyperliquid_borrow_rate_adversarial.py` implements 44 test functions (50 parametrized cases) covering all 40 CASHCLAW #25 adversarial scenarios plus crash safety and post-review regression checks:

- **OOS + Adversarial Suites:** `73 passed` (`test_hyperliquid_borrow_rate_adversarial.py`, `test_passive_oos_adapters_and_store.py`, `test_passive_oos_pipeline_adversarial.py`, `test_prospective_observation_contract.py`, `test_h3_v2_registration_immutability.py`).
- **Gitleaks Secret Scan:** `0 leaks found` across all modified/added files (`verification_lab/src/verification_lab/oos`, `test_hyperliquid_borrow_rate_adversarial.py`, `collect_h3_v2_passive_oos.py`, `plans/reports/cashclaw-h3-v2-hyperliquid-apr-adapter.md`).

---

## 14. Independent Fresh-Context Reviews & Remediations

Three independent fresh-context reviews plus a final isolated verification re-review were executed before finalizing:

1. **Reviewer A (Financial Economics):** Identified 1 P1 defect (`offline_replay.py` missing utilization/convention validation and unconditionally overriding `borrow_d` on legitimately rejected days) + 4 P2 hardening items. **All fixed and verified.**
2. **Reviewer B (Data Provenance & Causal Timing):** Identified 3 P1 defects (live advancing-clock causal violation in `HyperliquidReadOnlyAdapter` when `capture_dt` was sampled before borrow-rate HTTP calls; missing borrow-rate staleness re-check in `pipeline.py`; `offline_replay.py` missing `isCanonical`/duplicate-index/utilization checks) + 3 P2 items (missing `raw_envelopes` enforcement, `verify_saved_raw_borrow_evidence` hash cross-checks, unguarded `exchange_publication_time_utc` parse). **All fixed and verified.**
3. **Reviewer C (Security & Runtime):** Identified 3 P1 defects (same live-clock causal violation; `_default_transport` buffering full body before enforcing `max_response_bytes`; CLI `--borrow-apr-bps` using binary `float` and accepting `NaN`/`Inf`/negative) + 3 P2 items (`session.trust_env = False`, `PublicReadOnlyHttpClient` init/type/exception guards, `verify_saved_raw_borrow_evidence` `Decimal` error handling). **All fixed and verified.**
4. **Isolated Re-Review:** Caught 1 P1 tolerance parity mismatch between `offline_replay.py` (`0.0001` utilization / `0.02` balance) and `hyperliquid_borrow_rate.py` (`0.001` utilization / `0.01` balance). **Fixed, aligned to `0.001` / `0.01`, covered by `test_44_offline_replay_tolerance_parity_with_borrow_adapter`, and re-verified with 0 unresolved P0/P1 findings.**

---

## 15. CI & Deployment Safety Verification

- `.github/workflows/ci.yml` and `.github/workflows/open-core-ci.yml` run on `pull_request` to `main` (type-check, lint, build, vitest, knip, coverage, open-core boundary checks) with **zero** Cloudflare Worker deploy steps and **zero** remote D1 migrations.
- `.github/workflows/g13-paper-forward.yml` was untouched (triggers only on `schedule` / `workflow_dispatch`).
- No runtime market data files were committed to Git.

---

## 16. Remaining Risks, Caveats & Founder Review Handoff

- **No venue-signed per-reserve publication timestamp:** Hyperliquid's `allBorrowLendReserveStates` omits a reserve-level timestamp; provenance is honestly labeled `SOURCE_CAPTURED_LOCAL_UNAUTHENTICATED` and `LOCAL_CAPTURE_BOUNDED_NO_VENUE_PUB_TS` (or `BLOCKED_CAUSAL_PROVENANCE` under strict exchange-timestamp policy).
- **Portfolio Margin capital-structure caveat:** At 1.0x gross leverage with owned cash, the quoted USDC borrow rate acts as a conservative financing hurdle under frozen V2 rather than an actual drawn loan.
- **Next Gate:** **STOP AT FOUNDER REVIEW (`READY_FOR_FOUNDER_APR_ADAPTER_REVIEW`)**. Do not merge, deploy, or activate unattended daily collection until Founder approval.

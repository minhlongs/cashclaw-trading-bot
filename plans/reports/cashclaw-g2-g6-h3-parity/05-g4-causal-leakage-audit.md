# 05 — G4 Causal Leakage and Survivorship Audit

**Artifact:** `artifacts/g4_independent_leakage_audit.json` (SHA-256 `ef501e68877b07b0379b6ddbbb8761e756babb22943f9150316727eded21520f`)
**Audit Script:** `verification_lab/scripts/audit_g4_leakage.py`
**Verdict:** `PASS`

## 1. Prefix-Truncation Invariance (50/50 Seeds on Both Surfaces)

Both the standalone causal signal and the production `verification_lab.strategies.h3_basis_carry.build_positions_maker` function were tested across **50 deterministic seeds** (`0..49`) at **5 truncation cutoffs** (`[15, 30, 45, 60, 75]`):

| Surface Tested | Seeds Passed | Truncation Cutoffs | Divergent Cutoffs |
| --- | --- | --- | --- |
| Clean Causal Signal | `50 / 50` | `[15, 30, 45, 60, 75]` | `0` (`first_divergent_cutoff: null` for all 50) |
| Production `verification_lab.strategies.h3_basis_carry.build_positions_maker` | `50 / 50` | `[15, 30, 45, 60, 75]` | `0` (`first_divergent_cutoff: null` for all 50) |

*Note (Reviewer A non-blocking P2 observation):* The synthetic prefix-truncation harness exercises `build_positions_maker` with `lookback=10` on 80-bar fixtures rather than the signed spec's `lookbackDays=30`; the causal windowing mechanism is identical, and future empirical runs on restored parquets should also assert `lookbackDays=30`.

## 2. Adversarial Leakage Vector Detection (10/10 Caught)

All 10 adversarial leakage vectors (`data_origin: SYNTHETIC_SOFTWARE_TEST_FIXTURE`) were injected and caught by the independent audit harness:

| Vector ID | Name | Caught | Key Evidence |
| --- | --- | --- | --- |
| `G4-LV-01` | `future_candle_leakage_shift_minus_1` | `true` | `first_divergent_cutoff: 20` |
| `G4-LV-02` | `rolling_window_centered_leakage` | `true` | `first_divergent_cutoff: 20` |
| `G4-LV-03` | `future_fitted_normalization_zscore` | `true` | `first_divergent_cutoff: 20` |
| `G4-LV-04` | `funding_availability_mismatch` | `true` | `first_divergent_cutoff: 20`; `clean_signal_at_bar_20: 0.000190624` vs `leaky_signal_at_bar_20: 0.0026163945` |
| `G4-LV-05` | `cross_sectional_survivor_selection` | `true` | `first_divergent_cutoff: 40` |
| `G4-LV-06` | `label_overlap_across_split` | `true` | `actual_gap: 2 < holding_horizon: 5`, `label_overlap_detected: true`, `valid: false` |
| `G4-LV-07` | `train_test_embargo_failure` | `true` | `embargo_bars: 0` with `actual_gap: 5 == holding_horizon: 5`, `valid: false` |
| `G4-LV-08` | `incorrect_pit_universe_membership` | `true` | `first_divergent_cutoff: 0`, `newusdt_pre_listing_zero_weight: true` |
| `G4-LV-09` | `recursive_indicator_backward_ema_drift` | `true` | `first_divergent_cutoff: 20` |
| `G4-LV-10` | `data_import_ordering_corruption` | `true` | `first_divergent_cutoff: 0`, `monotonic_guard_rejected_unsorted: true`, `unguarded_processing_diverged: true` |

## 3. Purged and Embargoed Split Verification

Verified the historical `H3_MAKER` train/test split geometry:
- `n_bars: 2,130`
- `train_end: 1,491`, `test_start: 1,551`
- `actual_gap: 60` (`purge_bars: 30` + `embargo_bars: 30`, `holding_horizon: 30`)
- `label_overlap_detected: false`, `valid: true`

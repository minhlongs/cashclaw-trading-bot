# 08 — Full Execution Cost Stress Matrix (`$5,000` Tier, 90-Day Horizon)

- **G6 Execution Parity Status:** **`G6_FULL_EXECUTION_PARITY_NOT_VERIFIED`** (FIFO queue fill probability is NOT calibrated from L1 snapshots).
- **Operational Haircut Consistency:** `operational_penalty_bps_annual` (`50 bps/yr` UBTC wrapper haircut on Route A; `150 bps/yr` dual-venue/FX haircut on Route C) is applied identically to `capital_matrix.py`.

## Route A (Hyperliquid `UBTC/USDC` + `BTC-PERP`) — All 11 Scenarios

| Scenario | Evidence Basis | Friction Mult | Exec Cost | Shock Loss | Net Excess vs 4% Cash | Perp Liq Breached | Survives? |
| --- | --- | ---: | ---: | ---: | ---: | :---: | :---: |
| `S01_BASE_VENUE_FEES` | `OBSERVED_VENUE_PUBLISHED_PLUS_SYNTHETIC_SLIPPAGE` | `1.0x` | `$8.50` | `$0.00` | `$13.85` | `False` | `True` |
| `S02_FRICTION_1_5X` | `SYNTHETIC_STRESS_ASSUMPTION` | `1.5x` | `$12.75` | `$0.00` | `$9.60` | `False` | `True` |
| `S03_FRICTION_2X` | `SYNTHETIC_STRESS_ASSUMPTION` | `2.0x` | `$17.00` | `$0.00` | `$5.35` | `False` | `True` |
| `S04_FRICTION_3X` | `SYNTHETIC_STRESS_ASSUMPTION` | `3.0x` | `$25.49` | `$0.00` | `$-3.14` | `False` | `False` |
| `S05_ADVERSE_FUNDING_REVERSAL` | `SYNTHETIC_STRESS_ASSUMPTION` | `1.0x` | `$8.50` | `$0.00` | `$-78.77` | `False` | `False` |
| `S06_BASIS_DISLOCATION_5PCT` | `SYNTHETIC_STRESS_ASSUMPTION` | `1.5x` | `$12.75` | `$150.00` | `$-140.40` | `False` | `False` |
| `S07_BASIS_DISLOCATION_15PCT` | `SYNTHETIC_STRESS_ASSUMPTION` | `2.0x` | `$17.00` | `$450.00` | `$-444.65` | `False` | `False` |
| `S08_SEVERE_ONE_LEG_NON_FILL` | `SYNTHETIC_STRESS_ASSUMPTION` | `1.5x` | `$12.75` | `$45.00` | `$-110.76` | `False` | `False` |
| `S09_EXCHANGE_OUTAGE` | `SYNTHETIC_STRESS_ASSUMPTION` | `2.0x` | `$17.00` | `$75.00` | `$-107.33` | `False` | `False` |
| `S10_WRAPPED_BTC_DEPEG_5PCT` | `SYNTHETIC_STRESS_ASSUMPTION` | `1.0x` | `$8.50` | `$150.00` | `$-136.15` | `False` | `False` |
| `S11_SHORT_PERP_LIQUIDATION_PRESSURE` | `SYNTHETIC_STRESS_ASSUMPTION` | `2.0x` | `$17.00` | `$90.00` | `$-122.33` | `True` | `False` |

- **Route A `S04_FRICTION_3X`:** Turns negative (`-$3.14`) once the `50 bps/yr` UBTC wrapper haircut is applied consistently.
- **Route B (Binance) `S03_FRICTION_2X`:** `$+8.67` excess (modeled static 90d mean funding; fails on full historical time-series in Report 10).
- **Route C (Cross-Venue) `S03_FRICTION_2X`:** **`$-15.55` (FAILS)**.
- **Tail Vulnerability:** All 3 routes breach short-perp immediate maintenance margin on `S11_SHORT_PERP_LIQUIDATION_PRESSURE` (+25% rapid BTC rally before free-reserve top-up), proving market neutrality does NOT eliminate liquidation risk.

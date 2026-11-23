# 06 — Five-Tier Capital Feasibility Matrix (`$100–$10,000`, 90-Day Horizon, 4.00% Cash Benchmark)

Allocation Policy: `60% Spot Cash + 15% Perp Initial Margin + 25% Free Liquidity Reserve = 100%` (zero borrowing; reserve floor never reduced).

| Route | Tier | Spot/Perp Qty (BTC) | Perp IM | Free Reserve | 2-Leg RT Friction | 90d Gross Funding | 90d Cash Opp Cost | 90d Net Excess Carry | 90d ROE | 90d Excess vs Cash | Break-Even Days | Perp Liq Buffer | Eligibility Verdict |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `A` | `$100` | `0.00097` / `0.00097` | `$15.00` | `$25.43` | `$0.14` | `$1.50` | `$0.99` | `$0.30` | `1.29%` | `0.30%` | `28.5d` | `23.9%` | `MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED` |
| `A` | `$500` | `0.00488` / `0.00487` | `$75.00` | `$125.29` | `$0.70` | `$7.52` | `$4.93` | `$1.52` | `1.29%` | `0.30%` | `28.3d` | `23.8%` | `MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED` |
| `A` | `$1000` | `0.00976` / `0.00975` | `$150.00` | `$250.58` | `$1.40` | `$15.06` | `$9.86` | `$3.06` | `1.29%` | `0.31%` | `28.2d` | `23.8%` | `MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED` |
| `A` | `$5000` | `0.04884` / `0.04878` | `$750.00` | `$1250.47` | `$7.00` | `$75.36` | `$49.32` | `$15.35` | `1.29%` | `0.31%` | `28.2d` | `23.8%` | `MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED` |
| `A` | `$10000` | `0.09769` / `0.09757` | `$1500.00` | `$2500.32` | `$13.99` | `$150.73` | `$98.63` | `$30.70` | `1.29%` | `0.31%` | `28.2d` | `23.8%` | `MECHANICALLY_FEASIBLE_RESEARCH_CANDIDATE_NOT_VALIDATED` |
| `B` | `$100` | `0.00097` / `0.000` | `$15.00` | `$25.33` | `$0.12` | `$0.00` | `$0.99` | `$-1.11` | `-0.12%` | `-1.11%` | `999999.0d` | `0.0%` | `INFEASIBLE_BELOW_VENUE_MINIMUMS` |
| `B` | `$500` | `0.004` / `0.004` | `$75.00` | `$178.96` | `$0.74` | `$6.47` | `$4.93` | `$0.80` | `1.15%` | `0.16%` | `43.1d` | `28.0%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |
| `B` | `$1000` | `0.009` / `0.009` | `$150.00` | `$296.41` | `$1.66` | `$14.57` | `$9.86` | `$3.04` | `1.29%` | `0.30%` | `31.8d` | `24.6%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |
| `B` | `$5000` | `0.048` / `0.048` | `$750.00` | `$1297.50` | `$8.86` | `$77.69` | `$49.32` | `$19.52` | `1.38%` | `0.39%` | `28.1d` | `22.9%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |
| `B` | `$10000` | `0.097` / `0.097` | `$1500.00` | `$2533.49` | `$17.91` | `$157.01` | `$98.63` | `$40.47` | `1.39%` | `0.40%` | `27.6d` | `22.7%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |
| `C` | `$100` | `0.00097` / `0.00097` | `$15.00` | `$25.33` | `$5.17` | `$1.50` | `$0.99` | `$-4.88` | `-3.90%` | `-4.88%` | `1597.3d` | `23.9%` | `INFEASIBLE_NEGATIVE_EXCESS_CARRY_AND_UNVERIFIED_ACCESS` |
| `C` | `$500` | `0.00487` / `0.00487` | `$75.00` | `$125.44` | `$5.87` | `$7.52` | `$4.93` | `$-4.39` | `0.11%` | `-0.88%` | `356.2d` | `23.8%` | `INFEASIBLE_NEGATIVE_EXCESS_CARRY_AND_UNVERIFIED_ACCESS` |
| `C` | `$1000` | `0.00975` / `0.00975` | `$150.00` | `$250.27` | `$6.75` | `$15.06` | `$9.86` | `$-3.77` | `0.61%` | `-0.38%` | `203.7d` | `23.8%` | `INFEASIBLE_NEGATIVE_EXCESS_CARRY_AND_UNVERIFIED_ACCESS` |
| `C` | `$5000` | `0.04877` / `0.04878` | `$750.00` | `$1250.14` | `$13.75` | `$75.36` | `$49.32` | `$1.20` | `1.01%` | `0.02%` | `82.8d` | `23.8%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |
| `C` | `$10000` | `0.09754` / `0.09757` | `$1500.00` | `$2500.28` | `$22.50` | `$150.73` | `$98.63` | `$7.41` | `1.06%` | `0.07%` | `67.7d` | `23.8%` | `UNVERIFIED_VENUE_ACCESS_MECHANICALLY_SIZABLE` |

*Full 20-metric records (including `min_spot_order_usd`, `min_perp_position_usd`, `rounding_mismatch_usd`, `maintenance_margin_usd`, `one_leg_failure_cost_usd`, `min_viable_funding_annual_bps`, `adverse_funding_reversal_loss_usd`, `max_modeled_stress_loss_usd`, `required_operational_availability`, `venue_access_classification`, and `data_confidence_classification`) are stored in `manifest.json`.*

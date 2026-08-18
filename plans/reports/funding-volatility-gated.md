# Volatility-Gated Funding Fade — SOL

**Date:** 2026-08-18
**Symbol:** SOLUSDT | **Exchange:** Binance Futures
**Window:** 2024-08-18 → 2025-09-19 (1190 candles)
**Train:** → 2025-01-06 (65%) | **Test:** → 2025-09-19 (35%)
**Costs:** conservative (fee=5bps, slip=5bps, impact=2bps)
**Data:** 1189 funding periods, 1190 8h candles
---

## Volatility Regime

Rolling window: 24 bars (192h = 8 days)
Train-set thresholds: p25=0.017704, p75=0.023442
LOW=269 (23.1%) | MID=505 (43.3%) | HIGH=392 (33.6%)

## Results

| Thr | Hold | Mode | Train# | Train PnL | Train Sharpe | Test# | Test PnL | Test Sharpe | CI 5% | CI 95% | Win% | PF | OOS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0.0001 | 6 | Base | 65 | $6080 | 3.43 | 61 | $3002 | 6.38 | $-3 | $105 | 55.7% | 1.62 | MARG |
| 0.0001 | 6 | Gated | 5 | $-118 | -6.83 | 13 | $1585 | 24.27 | $47 | $195 | 69.2% | 5.83 | PASS |
| 0.0001 | 12 | Base | 65 | $6080 | 3.43 | 61 | $3002 | 6.38 | $-5 | $105 | 55.7% | 1.62 | MARG |
| 0.0001 | 12 | Gated | 5 | $-118 | -6.83 | 13 | $1585 | 24.27 | $47 | $197 | 69.2% | 5.83 | PASS |
| 0.0001 | 24 | Base | 65 | $6080 | 3.43 | 61 | $3002 | 6.38 | $-2 | $105 | 55.7% | 1.62 | MARG |
| 0.0001 | 24 | Gated | 5 | $-118 | -6.83 | 13 | $1585 | 24.27 | $47 | $193 | 69.2% | 5.83 | PASS |
| 0.0003 | 6 | Base | 23 | $980 | 5.01 | 4 | $-150 | -2.47 | $-368 | $398 | 25.0% | 0.82 | FAIL |
| 0.0003 | 6 | Gated | 3 | $-31 | -2.16 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |
| 0.0003 | 12 | Base | 23 | $980 | 5.01 | 4 | $-150 | -2.47 | $-366 | $398 | 25.0% | 0.82 | FAIL |
| 0.0003 | 12 | Gated | 3 | $-31 | -2.16 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |
| 0.0003 | 24 | Base | 23 | $980 | 5.01 | 4 | $-150 | -2.47 | $-366 | $293 | 25.0% | 0.82 | FAIL |
| 0.0003 | 24 | Gated | 3 | $-31 | -2.16 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |
| 0.0005 | 6 | Base | 2 | $364 | 558.49 | 2 | $227 | 4.67 | $-455 | $682 | 50.0% | 1.50 | FAIL |
| 0.0005 | 6 | Gated | 0 | $0 | 0.00 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |
| 0.0005 | 12 | Base | 2 | $364 | 558.49 | 2 | $227 | 4.67 | $-455 | $682 | 50.0% | 1.50 | FAIL |
| 0.0005 | 12 | Gated | 0 | $0 | 0.00 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |
| 0.0005 | 24 | Base | 2 | $364 | 558.49 | 2 | $227 | 4.67 | $-455 | $682 | 50.0% | 1.50 | FAIL |
| 0.0005 | 24 | Gated | 0 | $0 | 0.00 | 0 | $0 | 0.00 | $0 | $0 | 0.0% | 0.00 | FAIL |

## Gating Impact on OOS Results

| Thr | Hold | Base Sharpe | Gated Sharpe | Delta Sharpe | Base PnL | Gated PnL | Delta PnL | Improved? |
|---|---|---|---|---|---|---|---|---|
| 0.0001 | 6 | 6.38 | 24.27 | +17.89 | $3002 | $1585 | $-1417 | NO |
| 0.0001 | 12 | 6.38 | 24.27 | +17.89 | $3002 | $1585 | $-1417 | NO |
| 0.0001 | 24 | 6.38 | 24.27 | +17.89 | $3002 | $1585 | $-1417 | NO |
| 0.0003 | 6 | -2.47 | 0.00 | +2.47 | $-150 | $0 | $+150 | YES |
| 0.0003 | 12 | -2.47 | 0.00 | +2.47 | $-150 | $0 | $+150 | YES |
| 0.0003 | 24 | -2.47 | 0.00 | +2.47 | $-150 | $0 | $+150 | YES |
| 0.0005 | 6 | 4.67 | 0.00 | -4.67 | $227 | $0 | $-227 | NO |
| 0.0005 | 12 | 4.67 | 0.00 | -4.67 | $227 | $0 | $-227 | NO |
| 0.0005 | 24 | 4.67 | 0.00 | -4.67 | $227 | $0 | $-227 | NO |

## Verdict

**OOS improvement (Sharpe + PnL):** 3/9 configurations

**Sharpe improvement only:** 6/9 (risk-adjusted gain, may reduce absolute PnL)

**maxHold sweep note:** All maxHold variants produce identical trades because the reversal condition (funding flips past threshold) fires before maxHold triggers at every threshold level. maxHold is effectively irrelevant for 8h funding intervals with these threshold values.

**Sharpe improves but PnL often decreases.** Gating reduces trade count (filtering LOW_VOL only) which lowers absolute returns but improves risk-adjusted performance. This suggests gating removes losing trades but also removes some winning ones.

## Per-Regime Trade Breakdown (Base, thr=0.0001, hold=6)

| Regime | Exit Reason | PnL |
|---|---|---|
| MID | signal | $6981 |
| MID | signal | $176 |
| LOW | signal | $-17 |
| LOW | signal | $166 |
| LOW | signal | $318 |
| MID | signal | $-100 |
| MID | signal | $-236 |
| LOW | signal | $-75 |
| LOW | signal | $222 |
| HIGH | signal | $-167 |
| HIGH | signal | $679 |
| LOW | signal | $-106 |
| LOW | signal | $99 |
| LOW | signal | $265 |
| LOW | signal | $-130 |
| LOW | signal | $301 |
| MID | signal | $106 |
| MID | signal | $104 |
| MID | signal | $-191 |
| MID | signal | $-164 |
| MID | signal | $240 |
| MID | signal | $-9 |
| MID | signal | $-41 |
| HIGH | signal | $-189 |
| HIGH | signal | $111 |
| HIGH | signal | $-54 |
| HIGH | signal | $-280 |
| HIGH | signal | $366 |
| MID | signal | $145 |
| MID | signal | $-18 |
| MID | signal | $15 |
| MID | signal | $-97 |
| MID | signal | $112 |
| MID | signal | $491 |
| MID | signal | $118 |
| MID | signal | $344 |
| HIGH | signal | $278 |
| HIGH | signal | $-151 |
| HIGH | signal | $-14 |
| HIGH | signal | $373 |
| HIGH | signal | $-341 |
| HIGH | signal | $-454 |
| HIGH | signal | $-404 |
| MID | signal | $223 |
| LOW | signal | $352 |
| LOW | signal | $82 |
| LOW | signal | $109 |
| MID | signal | $32 |
| HIGH | signal | $45 |
| HIGH | signal | $223 |
| HIGH | signal | $-221 |
| HIGH | signal | $103 |
| HIGH | signal | $-18 |
| HIGH | signal | $140 |
| HIGH | signal | $-321 |
| HIGH | signal | $134 |
| HIGH | signal | $-455 |
| HIGH | signal | $194 |
| HIGH | signal | $-286 |
| HIGH | signal | $-276 |
| HIGH | signal | $471 |
| HIGH | signal | $682 |
| HIGH | signal | $106 |
| HIGH | signal | $260 |
| HIGH | signal | $-245 |
| MID | signal | $-263 |
| MID | signal | $-352 |
| MID | signal | $-267 |
| MID | signal | $-40 |
| LOW | signal | $-36 |
| LOW | signal | $-51 |
| LOW | signal | $-141 |
| LOW | signal | $166 |
| LOW | signal | $-56 |
| MID | signal | $-72 |
| MID | signal | $-84 |
| MID | signal | $116 |
| MID | signal | $-163 |
| MID | signal | $190 |
| MID | signal | $175 |
| MID | signal | $-228 |
| MID | signal | $-149 |
| MID | signal | $88 |
| MID | signal | $431 |
| MID | signal | $-194 |
| MID | signal | $28 |
| MID | signal | $-182 |
| MID | signal | $-2 |
| MID | signal | $-389 |
| MID | signal | $-97 |
| MID | signal | $102 |
| MID | signal | $-123 |
| MID | signal | $-370 |
| MID | signal | $-6 |
| MID | signal | $311 |
| HIGH | signal | $-538 |
| HIGH | signal | $43 |
| HIGH | signal | $-220 |
| HIGH | signal | $30 |
| HIGH | signal | $28 |
| HIGH | signal | $-137 |
| HIGH | signal | $77 |
| HIGH | signal | $275 |
| HIGH | signal | $-146 |
| HIGH | signal | $118 |
| HIGH | signal | $-176 |
| HIGH | signal | $27 |
| HIGH | signal | $164 |
| HIGH | signal | $119 |
| HIGH | signal | $-170 |
| HIGH | signal | $888 |
| HIGH | signal | $-213 |
| HIGH | signal | $-7 |
| HIGH | signal | $111 |
| HIGH | signal | $-93 |
| HIGH | signal | $498 |
| HIGH | signal | $-338 |
| HIGH | signal | $28 |
| HIGH | signal | $-571 |
| HIGH | signal | $-41 |
| HIGH | signal | $115 |
| HIGH | signal | $480 |
| HIGH | signal | $-133 |
| HIGH | signal | $-133 |
| HIGH | signal | $324 |
| HIGH | signal | $225 |

---
*Research backtest — not a production recommendation.*
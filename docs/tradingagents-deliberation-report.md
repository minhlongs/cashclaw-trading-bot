# TradingAgents Deliberation Report / Báo cáo Deliberation TradingAgents

> **D11 Honesty Label / Nhãn trung thực D11:** This demo uses DeterministicFixtureProvider (D11 TEST seam) — not real LLM deliberation quality.
> Demo này dùng DeterministicFixtureProvider (D11 TEST seam) — KHÔNG phải chất lượng deliberation LLM thật.

## Summary / Tóm tắt
- Research Goal ID: `goal-demo`
- Proposal ID: `prop-demo`
- Created At / Tạo lúc: 2026-08-26T00:00:00.000Z
- DeliberationReport: 7 stages — completed 6, failed 0, skipped 0, rejected 1

## Stage Results / Kết quả từng giai đoạn
| Stage / Giai đoạn | Outcome / Kết quả | Reasons / Lý do |
|---|---|---|
| analyst-output | completed | — |
| debate-output | completed | — |
| research-synthesis | completed | — |
| risk-proposal | completed | — |
| portfolio-proposal | completed | — |
| cashclaw-validation | completed | — |
| human-decision | rejected | portfolio: risk overlay violation — position cap: clipped 1 position(s), largest alpha-momentum 0.7500 -> 0.3000 |

**Σ≡N invariant / Bất biến Σ≡N:** completed(6) + failed(0) + skipped(0) + rejected(1) = 7 ≡ total(7)

## Decision Proposal / Đề xuất quyết định
- Thesis / Luận điểm: {"thesis":"Momentum persists in trending regime","evidence":["Trend strength above 20-day MA","Volume confirmation"],"mechanism":"Trend-following momentum drives continued returns due to persistent investor flows","expectedDirection":"long","horizon":20,"features":["momentum_20d","volume_ratio"]}
- Counter-thesis / Luận điểm đối lập: {"thesis":"Mean reversion dominates after overextension","evidence":["RSI above 70","Divergence in volume"],"mechanism":"Overextension in momentum leads to reversal as positioning unwinds","expectedDirection":"short","horizon":20,"features":["rsi_14","volume_divergence"]}
- Direction / Hướng: long
- Confidence / Độ tin cậy: 0.65
- Horizon / Tầm nhìn: 20 bars

## Hypotheses / Giả thuyết
- Count / Số lượng: 2
- Experiment specs / Đặc tả thí nghiệm: 2

## Model Provenance Accounting / Kế toán provenance mô hình
- Calls / Số lần gọi: 11
- Prompt tokens: 1100
- Completion tokens: 550
- Total tokens / Tổng token: 1650
- Total latency / Tổng độ trễ: 110 ms

| Tier / Tầng | Calls / Số lần gọi | Tokens / Token |
|---|---|---|
| FAST | 4 | 600 |
| REASONING | 3 | 450 |
| LOCAL | 4 | 600 |

## Safety / An toàn
- PAPER/BACKTEST ONLY — no real orders / CHỈ PAPER/BACKTEST — không đặt lệnh thật.
- LLM output is advisory only; deterministic CashClaw engines decide sizing/risk.
- Kết quả LLM chỉ mang tính tham vấn; engine CashClaw tất định quyết định sizing/rủi ro.

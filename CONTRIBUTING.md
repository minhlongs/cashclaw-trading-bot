# Contributing to CashClaw Open-Core (VN / EN)

Chào mừng các nhà nghiên cứu định lượng (Quants) và kỹ sư đóng góp vào CashClaw!
Welcome quantitative researchers and engineers to the CashClaw Open-Core project!

## 1. Kiến trúc Open-Core / Open-Core Structure
- **`src/tree/` (Apache-2.0):** Pure domain logic — QuantLib (62+ waves), Alpha Zoo, Microstructure, Paper Engine. Zero I/O, zero network calls.
- **`src/land/` (Apache-2.0):** Cross-domain orchestration & provider routing.
- **`src/forest/` (Apache-2.0):** D1 persistence, walk-forward backtester, TradingAgents deliberation.
- **`src/ee/` (Commercial License):** Multi-tenant SaaS, 24/7 Cloud Scheduler, Billing/Quotas, Managed LLM credits, Cloud Alpha Feed.

## 2. Quy chuẩn Code Bắt buộc / Mandatory Code Standards
1. **Zero `:any` types** — TypeScript strict mode (`npm run typecheck`).
2. **Giới hạn 200 dòng / Max 200 LOC per file** — Tách nhỏ thành `*-types.ts`, `*-estimator.ts`, `*-engine.ts`.
3. **Không dùng dữ liệu tương lai / Zero Lookahead** — Mọi chỉ báo định lượng phải thuần nhân quả (causal).
4. **Không `console.log` & Không thêm `eslint-disable`** — Giữ nguyên baseline ESLint freeze.
5. **100% Test Pass** — Chạy `npm test` trước khi gửi Pull Request.

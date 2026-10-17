# CashClaw Stitch UI Design Specs & Prompts (`stitch-kit`)

> Tài liệu chuẩn hóa Design Spec JSON và Stitch Prompts (Path B) cho 3 màn hình cốt lõi của **CashClaw Alpha Research & Paper Trading OS** theo quy trình `stitch-kit`.
> Dùng trực tiếp với công cụ MCP `generate_screen_from_text` hoặc dán vào [stitch.withgoogle.com](https://stitch.withgoogle.com).

---

## 1. Master Design Spec JSON (`stitch-ui-design-spec-generator`)

```json
{
  "theme": "DARK",
  "primaryColor": "#00D4AA",
  "headlineFont": "GEIST",
  "bodyFont": "GEIST",
  "labelFont": "JETBRAINS_MONO",
  "colorVariant": "FIDELITY",
  "roundness": "ROUND_TWELVE",
  "spacingScale": 1,
  "backgroundLight": "#F8FAFC",
  "backgroundDark": "#0B0E11",
  "density": "COMPACT",
  "designMode": "HIGH_FIDELITY",
  "styleKeywords": ["Quantitative", "Terminal", "Institutional", "Dark-Mode", "Data-Dense"],
  "deviceType": "DESKTOP"
}
```

---

## 2. Screen 1: Alpha Research & Paper Trading Cockpit (`/dashboard`)

```text
Desktop High-Fidelity quantitative paper-trading and alpha research dashboard for CashClaw OS. Institutional Quantitative Terminal aesthetic. High-fidelity brand color matching. Dark mode. Background: Deep Obsidian Abyss (#0B0E11) with Slate Carbon panels (#141820) and Elevated Midnight surfaces (#1A2030). Primary: Quant Emerald Teal (#00D4AA). Secondary: Deliberation Violet (#A78BFA). Semantic: Crimson Alert (#FF4757) and Amber Caution (#FFB020). Headline font: Geist (600-700 weight). Body font: Geist (400-500 weight, 14px). Label & Telemetry font: JetBrains Mono (tabular numerals). Roundness: 12px for cards, 8px for buttons/inputs. Compact spacing (16px grid gaps), data-dense layout.

Left sidebar navigation (240px wide, #141820 background, 1px solid #1E2530 right border): CashClaw logo top-left with amber 'PAPER_ONLY • ADR-001' pill badge, navigation links with icons (Cockpit Overview, Alpha Zoo Evaluator, Volatility-DCA Bots, Walk-Forward Sweep, SaaS Billing & Quota), and workspace selector ('ws_quant_desk_01 • PREMIUM') at the bottom. Main content area (max-width 1440px, 24px padding): Top header bar with bilingual toggle (EN / VI), Data Quality Gate status badge ('9/9 OHLCV Validators PASS'), and '+ New Paper Bot' primary CTA button (#00D4AA fill, #0B0E11 text, 44px height).

KPI Row (4-column grid, 16px gap):
1. 'Simulated Portfolio Equity' — $124,850.40 (JetBrains Mono 28px bold) with +4.82% (+$5,740.10) in #00D4AA.
2. 'Active Paper Bots' — 4 / 5 Quota Used, 3 Volatility-DCA + 1 Grid running on 5m interval.
3. 'Alpha Zoo Falsification' — 12 Seeds Evaluated (IC/IR Bridge), Σ≡12 Verified, 0 Lookahead Leaks.
4. 'Deliberation Credits' — 9,992 / 10,000 Credits Remaining (#A78BFA progress bar).

Center Analytical Split (8-column left / 4-column right):
- Left 8 columns: 'BTC/USDT Volatility-Adjusted DCA Execution Chart' card (#141820) showing candlestick price action ($67,420.50), dynamic Bollinger/ATR volatility bands, green buy execution markers (#00D4AA), and fee/slippage attribution footer ('Fee: 10 bps • Slippage: 5 bps • Paper Fill').
- Right 4 columns: 'TradingAgents Multi-Agent Deliberation Feed' card (#141820) with violet #A78BFA header badge, displaying Bull vs Bear researcher debate summary, confidence score (0.78), and SHA-256 hash-chained decision log entry ('0x9f4c...82a1').
```

---

## 3. Screen 2: QuantLib Volatility-DCA Strategy Visualizer (`/strategies/volatility-dca`)

```text
Desktop High-Fidelity strategy configuration and backtest visualizer screen for CashClaw QuantLib Volatility-DCA. Institutional Quantitative Terminal aesthetic. Dark mode (#0B0E11 canvas, #141820 cards, 1px solid #1E2530 borders). Primary: Quant Emerald Teal (#00D4AA). Warning: Amber (#FFB020). Telemetry font: JetBrains Mono. UI font: Geist. Roundness: 12px cards, 8px controls.

Top breadcrumb bar: 'Strategies / QuantLib / Volatility-Adjusted DCA (volatilityDca)' with strict '100% Coverage Verified • Paper Mode Locked' badge in #FFB020. Main workspace split into a 4-column Parameter & Stress Configuration panel on the left and an 8-column Interactive Signal & Regime Simulation panel on the right.

Left Panel ('Strategy Parameters & Stress Bounds'):
- Symbol selector ('BTC/USDT', 'ETH/USDT', 'SOL/USDT'), Interval selector ('5m', '15m', '1h', '1d').
- Numeric sliders with JetBrains Mono readouts: Lookback Period (14 bars), Volatility Deviation Threshold (2.0 σ), Base Order Size ($250 USDT), Max Safety Multiplier (2.5x), Fee Floor (10 bps), Slippage Stress (5 bps).
- Action buttons: Primary 'Run Walk-Forward Backtest' (#00D4AA, 44px height) and Secondary 'Export Signed Cloud Sync Bundle' (#1A2030).

Right Panel ('Signal Attribution & Walk-Forward Diagnostics'):
- Top 3 mini-KPI cards: Signal Verdict ('BUY • Confidence 0.84' in #00D4AA), Realized Annualized Volatility ('48.2% • High-Vol Regime'), and Net Sharpe After Stress Costs ('1.92').
- Main diagnostic table: 16 Walk-Forward Windows showing Window Period, In-Sample IC, Out-of-Sample Sharpe, Max Drawdown (-6.4% in #FF4757), and Survival Gate status badge.
```

---

## 4. Screen 3: Cloud SaaS Billing, Quota & CLI Sync Bridge (`/billing`)

```text
Desktop High-Fidelity SaaS monetization, crypto billing, and local-to-cloud CLI sync dashboard for CashClaw Enterprise Edition. Institutional Quantitative Terminal aesthetic. Dark mode (#0B0E11 background, #141820 surface cards, #1A2030 modal preview). Primary: Quant Emerald Teal (#00D4AA). AI Accent: Violet (#A78BFA). Typography: Geist + JetBrains Mono.

Top section: 'Workspace Plan & Resource Quotas' (2-column split):
- Left card ('QuotaUsageCard'): Current Tier badge ('PREMIUM • $29/mo'), Paper Bots progress bar (4 / 5 active), Deliberation Token Credits meter (9,992 / 10,000 credits in #A78BFA), and 'Upgrade to ENTERPRISE' button (#00D4AA).
- Right card ('CliSyncBridgeCard'): Local-to-Cloud Zero-Secret Sync status, SHA-256 bundle checksum ('e3b0c442...98fc1c14'), 'Secret Stripping: ACTIVE (API keys & Telegram tokens removed per ADR-001)' badge, and CLI command snippet (`npx cashclaw sync --bundle ./strategy-sync.json`).

Middle section ('TierComparisonTable' — 4 columns):
- Side-by-side comparison cards for BASIC ($0/mo, 1 Paper Bot, 500 Credits), PREMIUM ($29/mo highlighted with 1px solid #00D4AA border, 5 Paper Bots, 10,000 Credits, Full Curated Alpha Feed), ENTERPRISE ($99/mo, 25 Paper Bots, 50,000 Credits, Priority Isolate Lease), and MASTER ($299/mo, Unlimited Paper Bots, 250,000 Credits, Dedicated Quant Node).

Bottom / Overlay section ('NowpaymentsCheckoutModal' preview):
- Elevated modal (#1A2030, 16px radius) showing NOWPayments Crypto Invoice for PREMIUM Tier ($29.00 USDT TRC-20), HMAC-SHA512 IPN verification badge, wallet QR code placeholder, copyable deposit address in JetBrains Mono, and live payment status pill ('Waiting for 1 confirmation...').
```

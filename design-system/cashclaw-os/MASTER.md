# Design System Master File — CashClaw Quant OS (`ak-ui-ux-pro-max` + `DESIGN.md` Unified Source of Truth)

> **LOGIC:** When building or auditing a specific page, first check `design-system/pages/[page-name].md` (or `design-system/cashclaw-os/pages/[page-name].md`).
> If that file exists, its page-specific rules **override** this Master file.
> If not, strictly follow the global quantitative terminal rules below.

---

- **Project:** CashClaw OS (`cashclaw-quant-os`)
- **Stitch Project Resource:** `projects/6665149401860401191`
- **Stitch Design System Asset:** `assets/be7563bf9e4c400f85f92f80d27a5de5`
- **Category:** Fintech Quantitative Alpha Research & Institutional Paper-Trading Terminal
- **Safety Invariant:** `PAPER_ONLY • ADR-001` (Hard Execution Fence — Zero Live Exchange Order Routing)

---

## 1. Global Semantic Color Palette (`DESIGN.md` Section 2 & `ak-ui-ux-pro-max` Priority 1 Contrast)

| Semantic Token | Hex / Value | WCAG Contrast vs `#0B0E11` | Functional Role |
|----------------|-------------|----------------------------|-----------------|
| `--bg-primary` | `#0B0E11` | Base Canvas | Deep Obsidian Abyss — root page canvas and primary terminal backdrop |
| `--bg-surface` | `#141820` | Surface Layer 1 | Slate Carbon Panel — cards, 240px left sidebar navigation, KPI containers, data tables |
| `--bg-elevated` | `#1A2030` | Surface Layer 2 | Elevated Midnight Surface — active nav states, modals, dropdowns, active tooltips |
| `--bg-hover` | `#1E2838` | Interactive Hover | Interactive Slate Hover — table row hover, secondary button hover state |
| `--color-accent` / `--color-profit` | `#00D4AA` | `10.8:1` (AAA) | Quant Emerald Teal — primary CTAs, positive PnL, active focus rings, survival pass |
| `--color-loss` / `--color-error` | `#FF4757` | `5.9:1` (AA+) | Crimson Signal Alert — negative PnL, drawdown breach, falsified factor, flat fence |
| `--color-warning` | `#FFB020` | `10.4:1` (AAA) | Amber Regime Caution — volatility spike alerts, quota thresholds, `PAPER_ONLY • ADR-001` badges |
| `--color-ai` | `#A78BFA` | `7.4:1` (AAA) | Deliberation Violet — multi-agent LLM reasoning badges, IC/IR research tags, HMM/HRP telemetry |
| `--text-primary` | `#E8EAED` | `17.4:1` (AAA) | Crisp Alabaster — primary headlines, ticker prices, active labels |
| `--text-secondary` | `#8B95A5` | `6.8:1` (AA+) | Muted Steel Gray — table column headers, secondary metadata, axis labels |
| `--text-tertiary` | `#5A6577` | `3.6:1` (Muted) | Dim Slate — disabled states, decorative dividers, secondary hash suffixes |
| `--border-subtle` | `#1E2530` | Hairline Structural | Card borders, matrix grid lines, section separators (`1px solid #1E2530`) |
| `--border-default` | `#2A3340` | Control Border | Form controls, inactive tabs, modal frames (`1px solid #2A3340`) |

---

## 2. Typography & Numerical Telemetry Rules (`DESIGN.md` Section 3 & `ak-ui-ux-pro-max` Priority 5)

- **Primary UI Font (`--font-sans`):** `'Geist'`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif` — geometric legibility for navigation, headers, and bilingual EN/VI labels.
- **Quantitative & Telemetry Font (`--font-mono`):** `'JetBrains Mono'`, `ui-monospace`, `monospace` with strict `font-variant-numeric: tabular-nums` so streaming prices, Sharpe ratios, p-values, IC/IR matrices, and SHA-256 hashes never jitter horizontally.

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

.font-mono, table, [data-telemetry] {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
```

### Type Scale
| Level | Token | Size / Weight / Line-Height | Usage |
|-------|-------|-----------------------------|-------|
| Hero | `--text-hero` | `56px` / `900` / `1.25` | Style guide display & hero headers |
| Display H1 | `--text-2xl` | `24px–28px` / `700` / `1.25` | Primary KPI telemetry readouts |
| Section H2 | `--text-xl` | `20px` / `600` / `1.25` | Major analytical section headers |
| Card Title H3 | `--text-lg` | `14px–16px` / `600` / `1.5` | Matrix titles & simulator panel headers |
| Body Copy | `--text-base` | `14px` / `400` / `1.5` | Analytical descriptions & agent transcripts |
| Table / Nav | `--text-sm` | `12px–13px` / `500` / `1.5` | Dense matrix cells & 22-item sidebar navigation |
| Badge / Caption | `--text-xs` | `10px–11px` / `600` / `0.04em` | Uppercase safety badges (`PAPER_ONLY • ADR-001`) |

---

## 3. `ak-ui-ux-pro-max` Priority 1–10 Engineering Rules

1. **Priority 1 — Accessibility & Contrast:** Maintain WCAG AAA (`>= 7:1`) on primary telemetry text (`#E8EAED` on `#0B0E11` = `17.4:1`, `#00D4AA` on `#0B0E11` = `10.8:1`). Every interactive control MUST expose a high-contrast keyboard focus ring:
   ```css
   :focus-visible {
     outline: 2px solid #00D4AA;
     outline-offset: 2px;
   }
   ```
2. **Priority 2 — Touch Targets & Ergonomics:** Primary interactive buttons, selects, and form controls enforce `min-h-[44px]` (`44px` minimum touch target) with `cursor-pointer` and explicit hover/active feedback.
3. **Priority 3 — Motion & `prefers-reduced-motion`:** Micro-interactions run at `150ms–200ms ease`. All animations and transitions collapse immediately when reduced motion is requested:
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, ::before, ::after {
       animation-duration: 0.01ms !important;
       animation-iteration-count: 1 !important;
       transition-duration: 0.01ms !important;
       scroll-behavior: auto !important;
     }
   }
   ```
4. **Priority 4 — Layout & 22-Screen Navigation Shell:** Fixed left sidebar (`240px` / `w-60`) linking all 22 CashClaw OS screens + fluid analytical workspace (`max-w-7xl` / `1440px` container, `24px` padding, 3-col or 4-col KPI row + 12-col analytical split).
5. **Priority 5 — Quantitative Data Tables & Accessibility:** Use semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col" aria-sort="...">`, and `font-variant-numeric: tabular-nums`.
6. **Priority 6 — SVG-Only Iconography & Charts:** Zero emojis as UI icons. All sidebar icons and quantitative charts (candlesticks, variograms, Hawkes kernels, Hamilton state probabilities, HRP dendrograms) use crisp inline SVG vectors.
7. **Priority 7 — Causal & Fail-Closed Safety Signaling:** Every screen displays the `PAPER_ONLY • ADR-001` safety badge and explicitly distinguishes causal online estimators (e.g., $\xi_{t|t}$ filtered probabilities) from lookahead-contaminated retrodiction ($\xi_{t|T}$).

---

## 4. Pre-Delivery Verification Checklist

- [x] All 13 `DESIGN.md` semantic color tokens defined in `:root`
- [x] `Geist` + `JetBrains Mono` (`tabular-nums`) applied to all numerical readouts
- [x] `:focus-visible` `2px solid #00D4AA` ring present on all interactive elements
- [x] `@media (prefers-reduced-motion: reduce)` reset active in every screen
- [x] All 22 screens wired in left sidebar `<nav>` with `0` broken links and `0` `href="#"` placeholders
- [x] `PAPER_ONLY • ADR-001` badge visible in sidebar and header telemetry

# Design System: CashClaw Alpha Research & Paper Trading OS

**Project ID:** `cashclaw-quant-os`
**Device:** `DESKTOP` (Responsive Tablet & Mobile Fallback)
**Safety Mode:** `PAPER_ONLY` (ADR-001 Strict Invariant)

## 1. Visual Theme & Atmosphere

High-density quantitative research terminal and institutional paper-trading cockpit. The interface blends dark obsidian surfaces with precision emerald-teal accents (`#00D4AA`), crisp monospace telemetry (`JetBrains Mono`), and structured violet indicators (`#A78BFA`) for multi-agent LLM deliberation. Every screen prioritizes causal signal clarity, zero-clutter data density, and explicit paper-mode safety badges.

## 2. Color Palette & Roles

| Semantic Token | Hex / Value | Functional Role |
|----------------|-------------|-----------------|
| `--bg-primary` | `#0B0E11` | Deep Obsidian Abyss — root page canvas and primary terminal backdrop |
| `--bg-surface` | `#141820` | Slate Carbon Panel — cards, sidebar navigation, KPI containers, data tables |
| `--bg-elevated` | `#1A2030` | Elevated Midnight Surface — modals, dropdowns, active tooltips, drawer overlays |
| `--bg-hover` | `#1E2838` | Interactive Slate Hover — table row hover, secondary button hover state |
| `--color-accent` / `--color-profit` | `#00D4AA` | Quant Emerald Teal — primary CTAs, positive PnL, active focus rings, buy signals |
| `--color-loss` / `--color-error` | `#FF4757` | Crimson Signal Alert — negative PnL, drawdown warnings, sell signals, validation errors |
| `--color-warning` | `#FFB020` | Amber Regime Caution — volatility spike alerts, quota thresholds, paper-only badges |
| `--color-ai` | `#A78BFA` | Deliberation Violet — multi-agent LLM reasoning badges, IC/IR research tags |
| `--text-primary` | `#E8EAED` | Crisp Alabaster — primary headlines, ticker prices, active labels |
| `--text-secondary` | `#8B95A5` | Muted Steel Gray — table column headers, secondary metadata, axis labels |
| `--text-tertiary` | `#5A6577` | Dim Slate — disabled states, timestamps, hash checksums |
| `--border-subtle` | `#1E2530` | Hairline Structural Divider — card borders, grid lines, section separators |
| `--border-default` | `#2A3340` | Input & Control Border — form controls, inactive tabs, modal frames |

## 3. Typography Rules

- **Primary UI Font (`--font-sans`):** `Geist`, `-apple-system`, `BlinkMacSystemFont`, sans-serif — clean geometric legibility for navigation, labels, and bilingual EN/VI copy.
- **Quantitative & Telemetry Font (`--font-mono`):** `JetBrains Mono`, `ui-monospace`, monospace — tabular numerals for prices, Sharpe ratios, IC/IR metrics, SHA-256 hashes, and order book depth.

### Type Scale
- **Hero (`--text-hero`):** `56px` (`900` weight, `1.25` line-height)
- **Display H1 (`--text-2xl` to `--text-3xl`):** `28px–40px` (`700` weight, `1.25` line-height)
- **Section Header H2 (`--text-xl`):** `20px` (`600` weight, `1.25` line-height)
- **Card Title H3 (`--text-lg`):** `16px` (`600` weight, `1.5` line-height)
- **Body Copy (`--text-base`):** `14px` (`400` weight, `1.5` line-height)
- **Secondary / Table Cell (`--text-sm`):** `13px` (`500` weight, `1.5` line-height)
- **Caption / Badge (`--text-xs`):** `11px` (`600` weight, uppercase tracking `0.04em`)

## 4. Component Stylings & Geometry

- **Buttons & Interactive Targets:** Minimum `44px` touch target height, `8px` border radius (`--radius-md`), `600` font weight. Primary buttons use filled Quant Emerald (`#00D4AA`) with dark `#0B0E11` text; secondary buttons use `#1A2030` surface with `#2A3340` border.
- **Cards & Panels:** `12px` border radius (`--radius-lg`), `1px solid #1E2530` border, `#141820` surface fill, `16px` (`--space-4`) internal padding, subtle elevation (`0 4px 12px rgba(0, 0, 0, 0.25)`).
- **Modals & Drawers:** `16px` border radius (`--radius-xl`), `#1A2030` elevated surface, `0 8px 24px rgba(0, 0, 0, 0.3)` shadow, emerald glow accent (`0 0 20px rgba(0, 212, 170, 0.08)`).
- **Inputs & Selects:** `44px` min-height, `8px` radius, `#0B0E11` background, `1px solid #2A3340` border, `2px solid #00D4AA` focus-visible ring with `2px` offset.

## 5. Layout Principles & Motion

- **Application Shell:** Left fixed sidebar (`240px` expanded, `64px` collapsed) + fluid main workspace (`max-width: 1440px`, `24px` padding).
- **Grid System:** 4-column KPI summary grid (`gap: 16px`), 12-column analytical split for charts and strategy tables, single-column stack below `768px`.
- **Spacing Scale:** Base `4px` unit (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`).
- **Motion System:** Fast micro-interactions (`150ms ease`), standard transitions (`200ms ease`), panel transitions (`300ms ease`), with strict `@media (prefers-reduced-motion: reduce)` reset.

## 6. Design System Notes for Stitch Generation

Copy and paste this block into any Stitch prompt (`stitch-ui-prompt-architect` / `generate_screen_from_text`) to guarantee visual consistency across screens:

```text
**DESIGN SYSTEM (CashClaw Quant OS):**
- Platform: Desktop Web Application (1440px max container, 240px left sidebar)
- Theme: Dark Mode First (Institutional Quantitative Terminal aesthetic)
- Background: Deep Obsidian Abyss (#0B0E11) with Slate Carbon Cards (#141820) and Elevated Midnight Panels (#1A2030)
- Primary Accent: Quant Emerald Teal (#00D4AA) for primary CTAs, active states, and positive PnL
- Semantic Accents: Crimson Signal Alert (#FF4757) for drawdown/loss, Amber Caution (#FFB020) for PAPER_ONLY safety badges, Deliberation Violet (#A78BFA) for AI agent reasoning
- Borders: Hairline 1px solid #1E2530 on cards, #2A3340 on inputs
- Typography: Geist Sans for UI headers/labels (14px body, 20px section titles, 600 weight) + JetBrains Mono for all numerical telemetry, prices, IC/IR ratios, and SHA-256 checksums
- Geometry: 12px rounded cards, 8px rounded buttons/inputs, 44px minimum interactive height, compact data-dense spacing (16px grid gaps)
```

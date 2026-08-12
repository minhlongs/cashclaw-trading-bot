# Design Guidelines — CashClaw Algo Trader

## Design Philosophy
Dark trading terminal aesthetic. High information density. Every pixel serves a purpose.
Bilingual Vietnamese + English. No decorative noise. Data-first.

---

## 1. Design Principles
- **Data-first**: Every pixel serves information. No decorative noise.
- **Dark theme mandatory**: Traders spend hours looking at screens. Dark reduces eye strain.
- **Bilingual always**: Every label, title, and message in VN + EN.
- **Responsive density**: Desktop = maximum data density. Mobile = essential metrics only.
- **Status clarity**: Color is the fastest signal — green/red for P&L, amber for warnings, gray for neutral.

## 2. Color System

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0B0E11` | Page background, cards |
| `--bg-surface` | `#141820` | Card backgrounds, elevated panels |
| `--bg-elevated` | `#1A2030` | Popover / dropdown / modal |
| `--bg-hover` | `#1E2838` | Row hover, button hover |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-profit` | `#00D4AA` | Positive P&L, buy signals, active status |
| `--color-loss` | `#FF4757` | Negative P&L, sell signals, error status |
| `--color-warning` | `#FFB020` | Warnings, drawdown alerts |
| `--color-ai` | `#A78BFA` | AI / ML recommendations, intelligence layer |
| `--color-accent` | `#00D4AA` | Primary actions, links, focus ring |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#1E2530` | Card separator, inner dividers |
| `--border-default` | `#2A3340` | Card borders, input borders |
| `--border-focus` | `#00D4AA` | Active input ring |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#E8EAED` | Headlines, body text |
| `--text-secondary` | `#8B95A5` | Subtitles, timestamps, labels |
| `--text-tertiary` | `#5A6577` | Disabled, placeholder |

---

## 3. Typography

### Font Stack
- **UI font:** `Inter` — headings, labels, navigation, buttons
- **Data font:** `JetBrains Mono` — prices, numbers, market pairs, P&L values
- Both fonts support Vietnamese diacritics (ă, â, đ, ê, ô, ơ, ư)

### Type Scale
| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 11px | Table cells, labels, timestamps |
| `--text-sm` | 13px | Buttons, secondary text, input labels |
| `--text-base` | 14px | Card titles, body text, form fields |
| `--text-lg` | 16px | Section headers |
| `--text-xl` | 20px | Stat values, metric labels |
| `--text-2xl` | 28px | Hero stat values (balance, total P&L) |
| `--text-3xl` | 40px | Page titles |
| `--text-hero` | 56px | Landing page hero headline |

### Line Heights
| Token | Value |
|-------|-------|
| `--leading-tight` | 1.2 |
| `--leading-normal` | 1.5 |
| `--leading-relaxed` | 1.65 |

### Font Weights
| Token | Value |
|-------|-------|
| `--weight-normal` | 400 |
| `--weight-medium` | 500 |
| `--weight-semibold` | 600 |
| `--weight-bold` | 700 |
| `--weight-black` | 900 |

### Number Display Rules
- P&L values: right-aligned, JetBrains Mono 13px, weight 500, colored
- Prices: right-aligned, JetBrains Mono 13px, include precision (e.g., 6 decimals for BTC)
- Percentages: right-aligned, colored green (+) / red (-)

---

## 4. Spacing
| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Inline gaps, icon padding |
| `--space-2` | 8px | Tight elements, badge spacing |
| `--space-3` | 12px | Form field gaps |
| `--space-4` | 16px | Card padding, grid gap |
| `--space-6` | 24px | Section spacing |
| `--space-8` | 32px | Page margins |
| `--space-12` | 48px | Major section breaks |
| `--space-16` | 64px | Hero spacing |

---

## 5. Radii & Shadows
| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |
| `--radius-xl` | 16px |

| Token | Value |
|-------|-------|
| `--shadow-sm` | 0 1px 2px rgba(0,0,0,0.3) |
| `--shadow-md` | 0 4px 12px rgba(0,0,0,0.25) |
| `--shadow-lg` | 0 8px 24px rgba(0,0,0,0.3) |
| `--shadow-accent` | 0 0 20px rgba(0,212,170,0.08) |

---

## 6. Transitions
| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | 150ms ease | Hover states |
| `--transition-base` | 200ms ease | Button clicks, toggles |
| `--transition-slow` | 300ms ease | Panel open/close |

---

## 7. Component Patterns

### Card
- Background: `--bg-surface` (`#141820`)
- Border: 1px solid `--border-subtle` (`#1E2530`)
- Border-radius: `--radius-lg` (12px)
- Padding: 16px
- Flat design — no box shadows on cards

### Button — Primary
- Background: `--color-profit` (`#00D4AA`)
- Text: `--bg-primary` (`#0B0E11`)
- Font weight: semibold (600)
- Padding: 8px 16px
- Border-radius: 8px
- Hover: opacity 90%, transition 150ms

### Button — Ghost / Tertiary
- Background: transparent
- Text: `--text-secondary`
- Hover: `--bg-hover` background, `--text-primary` text
- Transition: 150ms

### Status Badge
- Background: semantic color at 12% opacity
- Text: matching semantic color
- Font: 11px, medium weight
- Border-radius: 6px
- Padding: 4px 8px

### Data Value (mono)
- Font: JetBrains Mono 13px
- Weight: 500
- Color: `--color-profit` (+), `--color-loss` (-), `--text-primary` (neutral)

### Input / Select
- Background: `--bg-primary` (`#0B0E11`)
- Border: 1px solid `--border-default` (`#2A3340`)
- Focus border: `--border-focus` (`#00D4AA`)
- Height: 36px
- Border-radius: 8px

### Table Row
- Height: 44px (standard), 36px (compact)
- Dividers: `--border-subtle`
- Hover: `--bg-hover` background
- Transition: 150ms

---

## 8. Layout Grid
- Sidebar: 240px fixed (collapsed to 64px icon-only)
- Main content: flexible, max-width 1440px centered
- Cards grid: `grid grid-cols-1 lg:grid-cols-3 gap-4`
- Stats row: `grid grid-cols-2 lg:grid-cols-4 gap-4`

---

## 9. Data Visualization Rules
- Profit bars: `--color-profit` (`#00D4AA`)
- Loss bars: `--color-loss` (`#FF4757`)
- AI confidence overlay: `--color-ai` (`#A78BFA`) at 30% opacity fill
- Grid lines: `--border-subtle` (`#1E2530`)
- Axis labels: `--text-tertiary` (`#5A6577`)
- Crosshair: `--color-accent` at 50% opacity

---

## 10. Responsive Breakpoints
| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Mobile | 320px – 767px | Single column, bottom nav, compact cards |
| Tablet | 768px – 1023px | 2-column grids, collapsible sidebar |
| Desktop | 1024px+ | Full layout, 3-column grids |
| Wide | 1440px+ | Max-width constrained, extra whitespace |

Mobile rules: sidebar becomes bottom tab bar (4 items), stats stack 1-col, tables become horizontal scroll, charts resize to full width.

---

## 11. Accessibility (WCAG 2.1 AA)
- All text: contrast ratio >= 4.5:1 (text-primary on bg-primary = 14.7:1, passes AAA)
- All interactive elements: minimum 44×44px touch target
- Focus indicator: `--color-accent` ring, 2px offset
- Reduced motion: respect `prefers-reduced-motion: reduce` — disable all transitions
- Screen reader: all icon-only buttons have `aria-label`
- Form inputs: always have `<label>` or `aria-label`
- Color is never the only indicator — always pair with icon or text label

---

## 12. Bilingual Support (Vietnamese + English)
- All labels, buttons, messages ship in both `en` and `vi`
- Use `next-intl` with locale segment `[locale]`
- Vietnamese diacritics: Inter + JetBrains Mono both render correctly
- Never truncate Vietnamese text — allow 1.2× English width in layouts
- VN text: `--text-sm` (13px), font-weight 400
- EN text: `--text-xs` (11px), `--text-secondary` color, font-weight 400

### Bilingual Label Format
```
[Tổng tài sản]           ← VN label (13px, text-primary, weight 400)
[Portfolio Value]        ← EN label (11px, text-secondary, weight 400)
```

### Sidebar Nav (Bilingual)
- VN item name on top line
- EN translation below in `--text-secondary`, 11px
- Example: "Bảng điều khiển | Dashboard"

---

## 13. Trading-Specific Patterns

### Price Display
- Always include currency (USD, USDT)
- Show change with sign: `+2.34%` or `-1.12%`
- Font: JetBrains Mono, right-aligned
- Profit = `--color-profit`, Loss = `--color-loss`

### Bot Status Flow
```
Paper Test → Live Running → Paused → Error → Stopped
  (blue)        (green)       (amber)  (red)   (gray)
```

### Risk Indicators
- Drawdown warning at >10%: `--color-warning` amber
- Drawdown critical at >20%: `--color-loss` red
- Display as small gauge or progress bar in dashboard

---

## 14. Anti-Patterns (Do NOT)
- Do NOT use light theme (project is dark-only)
- Do NOT use rounded corners larger than `--radius-xl` (16px)
- Do NOT use pure white (`#FFF`) for text — use `--text-primary` (`#E8EAED`)
- Do NOT hide destructive actions (Stop, Kill) behind menus — they must be visible
- Do NOT use animation for data updates (charts flush instantly on new data)
- Do NOT use `alert()` — use in-app toast notifications
- Do NOT use `console.log` in production — use Winston logger
- Do NOT use `:any` types in TypeScript

---

## 15. Wireframe Pages Covered
1. **01-login.html** — Login / Landing entry page
2. **02-dashboard.html** — Main dashboard with KPI grid, positions, P&L chart
3. **03-backtests.html** — Backtest results with equity curve, metrics table
4. **04-marketplace.html** — Strategy marketplace / RaaS listing page
5. **05-settings.html** — Settings: exchanges, strategy params, API keys, risk config

---

## 16. Screen Sizes for Wireframes
- Wireframes target 1440px desktop width
- Mobile variants shown in collapsible `< 768px` sections
- Each wireframe is a self-contained HTML file with embedded tokens CSS

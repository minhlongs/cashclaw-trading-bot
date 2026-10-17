// Pure Design System Token Matrix & Filter Model

export type TokenGroup = 'SURFACE' | 'SEMANTIC' | 'TEXT' | 'BORDER';

export interface ColorSwatch {
  readonly token: string;
  readonly hex: string;
  readonly group: TokenGroup;
  readonly role: string;
}

export const TOKEN_GROUP_FILTERS: readonly ('ALL' | TokenGroup)[] = [
  'ALL',
  'SURFACE',
  'SEMANTIC',
  'TEXT',
  'BORDER',
];

export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { token: '--bg-primary', hex: '#0B0E11', group: 'SURFACE', role: 'Deep Obsidian Abyss — Root Canvas' },
  { token: '--bg-surface', hex: '#141820', group: 'SURFACE', role: 'Slate Carbon Panel — Cards & Tables' },
  { token: '--bg-elevated', hex: '#1A2030', group: 'SURFACE', role: 'Elevated Midnight Surface — Modals' },
  { token: '--bg-hover', hex: '#1E2838', group: 'SURFACE', role: 'Interactive Slate Hover' },
  { token: '--color-accent', hex: '#00D4AA', group: 'SEMANTIC', role: 'Quant Emerald Teal — Profit & Focus' },
  { token: '--color-loss', hex: '#FF4757', group: 'SEMANTIC', role: 'Crimson Signal Alert — Loss & Error' },
  { token: '--color-warning', hex: '#FFB020', group: 'SEMANTIC', role: 'Amber Regime Caution — PAPER_ONLY' },
  { token: '--color-ai', hex: '#A78BFA', group: 'SEMANTIC', role: 'Deliberation Violet — Agent & IC/IR' },
  { token: '--text-primary', hex: '#E8EAED', group: 'TEXT', role: 'Crisp Alabaster — Headlines & Tickers' },
  { token: '--text-secondary', hex: '#8B95A5', group: 'TEXT', role: 'Muted Steel Gray — Table Headers' },
  { token: '--text-tertiary', hex: '#5A6577', group: 'TEXT', role: 'Dim Slate — SHA-256 Checksums' },
  { token: '--border-subtle', hex: '#1E2530', group: 'BORDER', role: 'Hairline Structural Divider (12px Card)' },
  { token: '--border-default', hex: '#2A3340', group: 'BORDER', role: 'Input & Control Border (8px Radius)' },
];

export function filterColorSwatches(
  activeGroup: 'ALL' | TokenGroup,
  swatches: readonly ColorSwatch[] = COLOR_SWATCHES,
): readonly ColorSwatch[] {
  if (activeGroup === 'ALL') return swatches;
  return swatches.filter((s) => s.group === activeGroup);
}

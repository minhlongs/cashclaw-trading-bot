import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const REPO_ROOT = process.cwd();
const PUBLIC_DIR = path.join(REPO_ROOT, 'site/public');
const QUEUE_DIR = path.join(REPO_ROOT, 'queue');

const EXPECTED_SCREENS = [
  { relPath: 'index.html', queueBase: 'index' },
  { relPath: 'alpha-zoo.html', queueBase: 'alpha-zoo' },
  { relPath: 'deliberation-theater.html', queueBase: 'deliberation-theater' },
  { relPath: 'strategies/volatility-dca.html', queueBase: 'volatility-dca' },
  { relPath: 'correlation-matrix.html', queueBase: 'correlation-matrix' },
  { relPath: 'execution-ledger.html', queueBase: 'execution-ledger' },
  { relPath: 'data-quality-gate.html', queueBase: 'data-quality-gate' },
  { relPath: 'microstructure-liquidity.html', queueBase: 'microstructure-liquidity' },
  { relPath: 'survival-gate.html', queueBase: 'survival-gate' },
  { relPath: 'sovereign-enclave.html', queueBase: 'sovereign-enclave' },
  { relPath: 'relative-value-basis.html', queueBase: 'relative-value-basis' },
  { relPath: 'billing.html', queueBase: 'billing' },
  { relPath: 'regime-attribution.html', queueBase: 'regime-attribution' },
  { relPath: 'fdr-multiple-testing-gate.html', queueBase: 'fdr-multiple-testing-gate' },
  { relPath: 'style-guide.html', queueBase: 'style-guide' },
  { relPath: 'portfolio-cvar-stress.html', queueBase: 'portfolio-cvar-stress' },
  { relPath: 'orderbook-imbalance-lob.html', queueBase: 'orderbook-imbalance-lob' },
  { relPath: 'rough-volatility-hurst.html', queueBase: 'rough-volatility-hurst' },
] as const;

const DESIGN_SECTION_6_BLOCK = [
  '**DESIGN SYSTEM (CashClaw Quant OS):**',
  '- Platform: Desktop Web Application (1440px max container, 240px left sidebar)',
  '- Theme: Dark Mode First (Institutional Quantitative Terminal aesthetic)',
  '- Background: Deep Obsidian Abyss (#0B0E11) with Slate Carbon Cards (#141820) and Elevated Midnight Panels (#1A2030)',
  '- Primary Accent: Quant Emerald Teal (#00D4AA) for primary CTAs, active states, and positive PnL',
  '- Semantic Accents: Crimson Signal Alert (#FF4757) for drawdown/loss, Amber Caution (#FFB020) for PAPER_ONLY safety badges, Deliberation Violet (#A78BFA) for AI agent reasoning',
  '- Borders: Hairline 1px solid #1E2530 on cards, #2A3340 on inputs',
  '- Typography: Geist Sans for UI headers/labels (14px body, 20px section titles, 600 weight) + JetBrains Mono for all numerical telemetry, prices, IC/IR ratios, and SHA-256 checksums',
  '- Geometry: 12px rounded cards, 8px rounded buttons/inputs, 44px minimum interactive height, compact data-dense spacing (16px grid gaps)',
].join('\n');

interface StitchManifestScreen {
  relPath: string;
  stitchScreenResource: string;
  publicBytes: number;
}

interface StitchManifest {
  projectId: string;
  totalScreens: number;
  brokenLinksCount: number;
  placeholderLinksCount: number;
  screens: StitchManifestScreen[];
}

describe('CashClaw OS Stitch-Loop Static Suite & Baton Verification', () => {
  it('verifies all 18 HTML screens in site/public/ exceed 5 KB and include PAPER_ONLY & DESIGN.md tokens', () => {
    for (const screen of EXPECTED_SCREENS) {
      const fullPath = path.join(PUBLIC_DIR, screen.relPath);
      expect(fs.existsSync(fullPath), `Missing public HTML: ${screen.relPath}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(5120);
      const html = fs.readFileSync(fullPath, 'utf8');
      expect(html).toContain('PAPER_ONLY');
      expect(html.toUpperCase()).toContain('#0B0E11');
      expect(html.toUpperCase()).toContain('#00D4AA');
    }
  });

  it('verifies staged HTML, PNG screenshots, and stitch-loop-manifest.json in queue/', () => {
    for (const screen of EXPECTED_SCREENS) {
      const queueHtml = path.join(QUEUE_DIR, `${screen.queueBase}.html`);
      const queuePng = path.join(QUEUE_DIR, `${screen.queueBase}.png`);
      expect(fs.existsSync(queueHtml), `Missing queue HTML: ${screen.queueBase}.html`).toBe(true);
      expect(fs.existsSync(queuePng), `Missing queue PNG: ${screen.queueBase}.png`).toBe(true);
      expect(fs.statSync(queueHtml).size).toBeGreaterThan(5120);
      expect(fs.statSync(queuePng).size).toBeGreaterThan(1024);
    }

    const manifestPath = path.join(QUEUE_DIR, 'stitch-loop-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as StitchManifest;
    expect(manifest.projectId).toBe('6665149401860401191');
    expect(manifest.totalScreens).toBe(18);
    expect(manifest.brokenLinksCount).toBe(0);
    expect(manifest.placeholderLinksCount).toBe(0);
    expect(manifest.screens).toHaveLength(18);
  });

  it('verifies zero broken relative links and zero href="#" placeholders across all 18 screens', () => {
    const hrefRegex = /<a\b[^>]*?\bhref=["']([^"']+)["']/gi;

    for (const screen of EXPECTED_SCREENS) {
      const fullPath = path.join(PUBLIC_DIR, screen.relPath);
      const html = fs.readFileSync(fullPath, 'utf8');
      const matches = Array.from(html.matchAll(hrefRegex), (m) => m[1]);
      expect(matches.length).toBeGreaterThanOrEqual(18);

      for (const href of matches) {
        expect(href, `Placeholder href="#" found in ${screen.relPath}`).not.toBe('#');
        const isExternal = /^(https?:|mailto:|tel:|javascript:)/i.test(href);
        if (!isExternal && !href.startsWith('#')) {
          const cleanTarget = href.split('#')[0]?.split('?')[0] ?? '';
          const resolved = path.resolve(path.dirname(fullPath), cleanTarget);
          expect(fs.existsSync(resolved), `Broken link ${href} in ${screen.relPath}`).toBe(true);
        }
      }
    }
  });

  it('verifies SITE.md marks all 18 screens [x], next-prompt.md has leadlag-hayashi-yoshida + DESIGN.md §6, and quant files <= 120 LOC', () => {
    const siteMd = fs.readFileSync(path.join(REPO_ROOT, 'SITE.md'), 'utf8');
    for (const screen of EXPECTED_SCREENS) {
      expect(siteMd).toContain(`- [x] ${screen.relPath}`);
    }

    const nextPrompt = fs.readFileSync(path.join(REPO_ROOT, 'next-prompt.md'), 'utf8');
    expect(nextPrompt).toMatch(/^---\npage:\s+leadlag-hayashi-yoshida\n---/);
    expect(nextPrompt).toContain(DESIGN_SECTION_6_BLOCK);

    const quantDir = path.join(REPO_ROOT, 'src/components/quant');
    const quantFiles = fs.readdirSync(quantDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const file of quantFiles) {
      const content = fs.readFileSync(path.join(quantDir, file), 'utf8');
      const lineCount = content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
      expect(lineCount, `${file} exceeds 120 lines (${lineCount})`).toBeLessThanOrEqual(120);
    }
  });

  it('verifies design-tokens.css and tailwind-theme.css define CashClaw Quant OS semantic tokens', () => {
    const designTokens = fs.readFileSync(path.join(REPO_ROOT, 'design-tokens.css'), 'utf8');
    const tailwindTheme = fs.readFileSync(path.join(REPO_ROOT, 'tailwind-theme.css'), 'utf8');

    for (const hex of ['#0B0E11', '#141820', '#1A2030', '#00D4AA', '#FF4757', '#FFB020', '#A78BFA']) {
      expect(designTokens.toUpperCase()).toContain(hex);
    }
    expect(tailwindTheme).toContain("@import './design-tokens.css'");
    expect(tailwindTheme).toContain('--color-quant-accent');
    expect(tailwindTheme).toContain('.stitch-badge-paper');
  });
});

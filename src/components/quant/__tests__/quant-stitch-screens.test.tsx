import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegimeAttributionSimulator } from '../regime-attribution-simulator';
import { FdrMultipleTestingGate } from '../fdr-multiple-testing-gate';
import { AlphaZooEvaluator } from '../alpha-zoo-evaluator';
import { DeliberationTheater } from '../deliberation-theater';
import { SurvivalGateMonitor } from '../survival-gate-monitor';
import { MicrostructureLiquidityAnalyzer } from '../microstructure-liquidity-analyzer';
import { DesignSystemStyleGuide } from '../design-system-style-guide';
import { HamiltonHmmWorkbench } from '../hamilton-hmm-workbench';
import { HrpAllocatorWorkbench } from '../hrp-allocator-workbench';
import { MartingaleOptimalTransportWorkbench } from '../martingale-optimal-transport-workbench';
import { RoughPathSignaturesWorkbench } from '../rough-path-signatures-workbench';
import { QuantUxProMaxBar } from '../quant-ux-pro-max-bar';
import { QuantRouteNav, QUANT_TERMINAL_ROUTES } from '../quant-route-nav';
import RegimeAttributionPage, { generateStaticParams as genRegimeParams } from '@/app/[locale]/(dashboard)/regime-attribution/page';
import FdrGatePage, { generateStaticParams as genFdrParams } from '@/app/[locale]/(dashboard)/fdr-gate/page';
import AlphaZooPage, { generateStaticParams as genZooParams } from '@/app/[locale]/(dashboard)/alpha-zoo/page';
import DeliberationPage, { generateStaticParams as genDelibParams } from '@/app/[locale]/(dashboard)/deliberation/page';
import SurvivalGatePage, { generateStaticParams as genSurvivalParams } from '@/app/[locale]/(dashboard)/survival-gate/page';
import MicrostructurePage, { generateStaticParams as genMicroParams } from '@/app/[locale]/(dashboard)/microstructure/page';
import StyleGuidePage, { generateStaticParams as genStyleParams } from '@/app/[locale]/(dashboard)/style-guide/page';
import RegimeSwitchingHamiltonHmmPage, { generateStaticParams as genHmmParams } from '@/app/[locale]/(dashboard)/regime-switching-hamilton-hmm/page';
import HrpAllocatorPage, { generateStaticParams as genHrpParams } from '@/app/[locale]/(dashboard)/hrp-allocator/page';
import MartingaleOptimalTransportPage, { generateStaticParams as genMotParams } from '@/app/[locale]/(dashboard)/martingale-optimal-transport/page';
import RoughPathSignaturesPage, { generateStaticParams as genSigParams } from '@/app/[locale]/(dashboard)/rough-path-signatures/page';

describe('CashClaw Quant OS Stitch Next.js Screens & A11y Suite (Waves 1–5)', () => {
  it('renders RegimeAttributionSimulator and FdrMultipleTestingGate', () => {
    render(<RegimeAttributionSimulator />);
    expect(screen.getByRole('region', { name: /Regime-Conditional Alpha Attribution Simulator/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EXTREME (35 bps)' }));
    expect(screen.getByText('35 bps')).toBeInTheDocument();

    render(<FdrMultipleTestingGate />);
    fireEvent.click(screen.getByRole('button', { name: 'HOLM_BONFERRONI' }));
    expect(screen.getAllByText('HOLM_BONFERRONI').length).toBeGreaterThanOrEqual(1);
  });

  it('renders AlphaZooEvaluator, DeliberationTheater, SurvivalGateMonitor, Microstructure, and StyleGuide', () => {
    render(<AlphaZooEvaluator />);
    fireEvent.click(screen.getByRole('button', { name: 'IMPORT_SKIPPED' }));
    expect(screen.getByText('vt_alpha_005')).toBeInTheDocument();

    render(<DeliberationTheater />);
    fireEvent.click(screen.getByRole('button', { name: /Trigger Veto/i }));
    expect(screen.getByText('KILLED_BY_RISK_VETO')).toBeInTheDocument();

    render(<SurvivalGateMonitor />);
    fireEvent.click(screen.getByRole('button', { name: 'STRUCTURAL' }));
    expect(screen.getByText('STR-01')).toBeInTheDocument();

    render(<MicrostructureLiquidityAnalyzer />);
    fireEvent.click(screen.getByRole('button', { name: 'SOL/USDT' }));
    expect(screen.getByText('TWAP_THROTTLED')).toBeInTheDocument();

    render(<DesignSystemStyleGuide />);
    fireEvent.click(screen.getByRole('button', { name: 'SEMANTIC' }));
    expect(screen.getByText('--color-accent')).toBeInTheDocument();
  });

  it('renders QuantUxProMaxBar (JSON + CSV export), HamiltonHmmWorkbench (#21), and HrpAllocatorWorkbench (#22)', () => {
    render(<QuantUxProMaxBar screenId="unit-test" telemetryPayload={{ metricA: 1.42, mode: 'PAPER' }} />);
    expect(screen.getAllByText('WCAG AAA 7:1 • TABULAR-NUMS').length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('button', { name: /Freeze Live Pulse/i }));
    expect(screen.getByText(/STREAM_FROZEN/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));
    expect(screen.getByText('Copied Telemetry CSV')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));
    expect(screen.getByText('Copied Telemetry JSON')).toBeInTheDocument();

    render(<HamiltonHmmWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: 'CALM_EXPANSION' }));
    expect(screen.getByText(/LOW_VOL_BULL/i)).toBeInTheDocument();

    render(<HrpAllocatorWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: 'CRISIS_CONTAGION' }));
    expect(screen.getByText('PAXG-PERP')).toBeInTheDocument();
  });

  it('renders MartingaleOptimalTransportWorkbench (#23), RoughPathSignaturesWorkbench (#24), and 24-route QuantRouteNav', () => {
    render(<MartingaleOptimalTransportWorkbench />);
    expect(screen.getByRole('region', { name: /Dupire Local Volatility and Martingale Optimal Transport Surface Workbench/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'BUTTERFLY_VIOLATION' }));
    expect(screen.getByText(/BUTTERFLY_ARB_ALERT/i)).toBeInTheDocument();

    render(<RoughPathSignaturesWorkbench />);
    expect(screen.getByRole('region', { name: /Lyons Rough Path Signatures and Levy Area Lead-Lag Classifier Workbench/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SOL_LEADS_BTC' }));
    expect(screen.getByText('ASSET2_LEADS_REVERSAL')).toBeInTheDocument();

    expect(QUANT_TERMINAL_ROUTES).toHaveLength(24);
    render(<QuantRouteNav locale="en" activeSlug="rough-path-signatures" />);
    expect(screen.getByText('24/24 QUANT OS ROUTES')).toBeInTheDocument();
  });

  it('verifies Next.js App Router pages and generateStaticParams for vi/en locales', () => {
    const expectedLocales = [{ locale: 'vi' }, { locale: 'en' }];
    for (const fn of [genRegimeParams, genFdrParams, genZooParams, genDelibParams, genSurvivalParams, genMicroParams, genStyleParams, genHmmParams, genHrpParams, genMotParams, genSigParams]) {
      expect(fn()).toEqual(expectedLocales);
    }

    render(<RegimeAttributionPage />);
    render(<FdrGatePage />);
    render(<AlphaZooPage />);
    render(<DeliberationPage />);
    render(<SurvivalGatePage />);
    render(<MicrostructurePage />);
    render(<StyleGuidePage />);
    render(<RegimeSwitchingHamiltonHmmPage />);
    render(<HrpAllocatorPage />);
    render(<MartingaleOptimalTransportPage />);
    render(<RoughPathSignaturesPage />);
    expect(screen.getAllByText('PAPER_ONLY • ADR-001').length).toBeGreaterThanOrEqual(11);
  });
});

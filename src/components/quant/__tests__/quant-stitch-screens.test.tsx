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

describe('CashClaw Quant OS Stitch Next.js Screens & A11y Suite (Waves 1–4)', () => {
  it('renders RegimeAttributionSimulator and switches cost tiers & regime filters', () => {
    render(<RegimeAttributionSimulator />);

    expect(screen.getByRole('region', { name: /Regime-Conditional Alpha Attribution Simulator/i })).toBeInTheDocument();
    expect(screen.getByText('PAPER_ONLY • ADR-001')).toBeInTheDocument();
    expect(screen.getByText('LOW_VOL_TREND')).toBeInTheDocument();
    expect(screen.getByText('LIQUIDITY_CRISIS')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'EXTREME (35 bps)' }));
    expect(screen.getByText('35 bps')).toBeInTheDocument();

    const select = screen.getByLabelText(/Volatility Regime Filter/i);
    fireEvent.change(select, { target: { value: 'LOW_VOL_TREND' } });
    expect(screen.getByText('LOW_VOL_TREND')).toBeInTheDocument();
    expect(screen.queryByText('LIQUIDITY_CRISIS')).toBeNull();
  });

  it('renders FdrMultipleTestingGate and updates FDR alpha q, trials, and correction procedure', () => {
    render(<FdrMultipleTestingGate />);

    expect(screen.getByRole('region', { name: /Multiple-Testing False Discovery Rate Gate/i })).toBeInTheDocument();
    expect(screen.getByText('PAPER_ONLY • ADR-001')).toBeInTheDocument();
    expect(screen.getByText('HYP-ZOO-001')).toBeInTheDocument();

    const slider = screen.getByLabelText(/Target FDR Alpha/i);
    fireEvent.change(slider, { target: { value: '0.01' } });
    expect(screen.getByText('q = 0.01')).toBeInTheDocument();

    const trialSelect = screen.getByLabelText(/Cumulative Hypothesis Trials/i);
    fireEvent.change(trialSelect, { target: { value: '64' } });

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

  it('renders HamiltonHmmWorkbench (#21), HrpAllocatorWorkbench (#22), QuantUxProMaxBar, and 22-route QuantRouteNav', () => {
    render(<QuantUxProMaxBar screenId="unit-test" telemetryPayload={{ ok: true }} />);
    expect(screen.getByText('WCAG AAA 7:1 • TABULAR-NUMS')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Freeze Live Pulse/i }));
    expect(screen.getByText(/STREAM_FROZEN/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));
    expect(screen.getByText('Copied Telemetry JSON')).toBeInTheDocument();

    render(<HamiltonHmmWorkbench />);
    expect(screen.getByRole('region', { name: /Hamilton Markov-Switching Regime Filter and Causal State Surface/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CALM_EXPANSION' }));
    expect(screen.getByText(/LOW_VOL_BULL/i)).toBeInTheDocument();

    render(<HrpAllocatorWorkbench />);
    expect(screen.getByRole('region', { name: /Hierarchical Risk Parity Recursive Bisection Portfolio Allocator/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'CRISIS_CONTAGION' }));
    fireEvent.click(screen.getByRole('button', { name: /HRP Weight/i }));
    expect(screen.getByText('PAXG-PERP')).toBeInTheDocument();

    expect(QUANT_TERMINAL_ROUTES).toHaveLength(22);
    render(<QuantRouteNav locale="en" activeSlug="hrp-allocator" />);
    expect(screen.getByText('Skip to main content')).toBeInTheDocument();
  });

  it('verifies Next.js App Router pages and generateStaticParams for vi/en locales', () => {
    const expectedLocales = [{ locale: 'vi' }, { locale: 'en' }];
    for (const fn of [genRegimeParams, genFdrParams, genZooParams, genDelibParams, genSurvivalParams, genMicroParams, genStyleParams, genHmmParams, genHrpParams]) {
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
    expect(screen.getAllByText('PAPER_ONLY • ADR-001').length).toBeGreaterThanOrEqual(9);
  });
});

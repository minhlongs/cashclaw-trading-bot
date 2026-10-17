import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RegimeAttributionSimulator } from '../regime-attribution-simulator';
import { FdrMultipleTestingGate } from '../fdr-multiple-testing-gate';
import { AlphaZooEvaluator } from '../alpha-zoo-evaluator';
import { DeliberationTheater } from '../deliberation-theater';
import { SurvivalGateMonitor } from '../survival-gate-monitor';
import { MicrostructureLiquidityAnalyzer } from '../microstructure-liquidity-analyzer';
import { DesignSystemStyleGuide } from '../design-system-style-guide';
import RegimeAttributionPage, { generateStaticParams as genRegimeParams } from '@/app/[locale]/(dashboard)/regime-attribution/page';
import FdrGatePage, { generateStaticParams as genFdrParams } from '@/app/[locale]/(dashboard)/fdr-gate/page';
import AlphaZooPage, { generateStaticParams as genZooParams } from '@/app/[locale]/(dashboard)/alpha-zoo/page';
import DeliberationPage, { generateStaticParams as genDelibParams } from '@/app/[locale]/(dashboard)/deliberation/page';
import SurvivalGatePage, { generateStaticParams as genSurvivalParams } from '@/app/[locale]/(dashboard)/survival-gate/page';
import MicrostructurePage, { generateStaticParams as genMicroParams } from '@/app/[locale]/(dashboard)/microstructure/page';
import StyleGuidePage, { generateStaticParams as genStyleParams } from '@/app/[locale]/(dashboard)/style-guide/page';

describe('CashClaw Quant OS Stitch Next.js Screens & A11y Suite', () => {
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

  it('renders AlphaZooEvaluator with zero-lookahead badge and verdict filtering', () => {
    render(<AlphaZooEvaluator />);

    expect(screen.getByRole('region', { name: /Alpha Zoo Evaluator/i })).toBeInTheDocument();
    expect(screen.getByText('ZERO_LOOKAHEAD • CAUSAL_AST')).toBeInTheDocument();
    expect(screen.getByText('PAPER_ONLY • ADR-001')).toBeInTheDocument();
    expect(screen.getByText('vt_alpha_001')).toBeInTheDocument();
    expect(screen.getByText('vt_alpha_005')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'IMPORT_SKIPPED' }));
    expect(screen.getByText('vt_alpha_005')).toBeInTheDocument();
    expect(screen.queryByText('vt_alpha_001')).toBeNull();
  });

  it('renders DeliberationTheater and toggles Risk Manager veto & stage filter', () => {
    render(<DeliberationTheater />);

    expect(screen.getByRole('region', { name: /Multi-Agent Deliberation Theater/i })).toBeInTheDocument();
    expect(screen.getByText('PROMOTED_TO_PAPER_SHADOW')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Trigger Veto/i }));
    expect(screen.getByText('KILLED_BY_RISK_VETO')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'RISK_AUDIT' }));
    expect(screen.getByText('RISK_MANAGER')).toBeInTheDocument();
    expect(screen.queryByText('BULL_RESEARCHER')).toBeNull();
  });

  it('renders SurvivalGateMonitor and filters structural vs economic pillars', () => {
    render(<SurvivalGateMonitor />);

    expect(screen.getByRole('region', { name: /Survival Gate and Promotion Lifecycle Monitor/i })).toBeInTheDocument();
    expect(screen.getByText('RESEARCH → KILLED')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'STRUCTURAL' }));
    expect(screen.getByText('STR-01')).toBeInTheDocument();
    expect(screen.queryByText('ECO-01')).toBeNull();
  });

  it('renders MicrostructureLiquidityAnalyzer and switches symbols & VPIN threshold', () => {
    render(<MicrostructureLiquidityAnalyzer />);

    expect(screen.getByRole('region', { name: /Microstructure and L2 Liquidity Toxicity Analyzer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SOL/USDT' }));
    expect(screen.getByText('TWAP_THROTTLED')).toBeInTheDocument();

    const vpinSlider = screen.getByLabelText(/VPIN Toxicity Halt Threshold/i);
    fireEvent.change(vpinSlider, { target: { value: '0.80' } });
    expect(screen.getByText('NORMAL_PASSIVE')).toBeInTheDocument();
  });

  it('renders DesignSystemStyleGuide and filters semantic token groups', () => {
    render(<DesignSystemStyleGuide />);

    expect(screen.getByRole('region', { name: /CashClaw OS Design System Style Guide/i })).toBeInTheDocument();
    expect(screen.getByText('--bg-primary')).toBeInTheDocument();
    expect(screen.getByText('--color-accent')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'SEMANTIC' }));
    expect(screen.getByText('--color-accent')).toBeInTheDocument();
    expect(screen.queryByText('--bg-primary')).toBeNull();
  });

  it('verifies Next.js App Router pages and generateStaticParams for vi/en locales', () => {
    const expectedLocales = [{ locale: 'vi' }, { locale: 'en' }];
    expect(genRegimeParams()).toEqual(expectedLocales);
    expect(genFdrParams()).toEqual(expectedLocales);
    expect(genZooParams()).toEqual(expectedLocales);
    expect(genDelibParams()).toEqual(expectedLocales);
    expect(genSurvivalParams()).toEqual(expectedLocales);
    expect(genMicroParams()).toEqual(expectedLocales);
    expect(genStyleParams()).toEqual(expectedLocales);

    render(<RegimeAttributionPage />);
    render(<FdrGatePage />);
    render(<AlphaZooPage />);
    render(<DeliberationPage />);
    render(<SurvivalGatePage />);
    render(<MicrostructurePage />);
    render(<StyleGuidePage />);
    expect(screen.getAllByText('PAPER_ONLY • ADR-001').length).toBeGreaterThanOrEqual(7);
  });
});

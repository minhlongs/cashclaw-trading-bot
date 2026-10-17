import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VolatilityDcaVisualizer } from './volatility-dca-visualizer';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      breadcrumb: 'Strategies / QuantLib',
      title: 'Volatility-Adjusted DCA (volatilityDca)',
      badgePaperOnly: '100% Coverage Verified • Paper Mode Locked',
      paramsHeading: 'Strategy Parameters & Stress Bounds',
      symbolLabel: 'Target Symbol',
      currentPriceLabel: 'Simulated Price',
      volatilityLabel: 'Realized Volatility (σ)',
      runBacktestButton: 'Run Walk-Forward Backtest',
      signalVerdictLabel: 'Signal Verdict',
      currentDrawdownLabel: 'Current Drawdown',
      sharpeStressLabel: 'Net Sharpe (After Stress)',
      walkForwardTitle: 'Signal Attribution & Walk-Forward Diagnostics',
      colWindow: 'Window Period',
      colIc: 'In-Sample IC',
      colSharpe: 'Out-of-Sample Sharpe',
      colDrawdown: 'Max Drawdown',
      colGate: 'Survival Gate',
    };
    return messages[key] ?? key;
  },
}));

describe('VolatilityDcaVisualizer Component', () => {
  it('renders strategy breadcrumbs, parameters, and paper mode badge', () => {
    render(<VolatilityDcaVisualizer initialPrice={60000} />);

    expect(screen.getByText('Volatility-Adjusted DCA (volatilityDca)')).toBeInTheDocument();
    expect(screen.getByText('100% Coverage Verified • Paper Mode Locked')).toBeInTheDocument();
    expect(screen.getByText('Strategy Parameters & Stress Bounds')).toBeInTheDocument();
    expect(screen.getByText('Run Walk-Forward Backtest')).toBeInTheDocument();
  });

  it('renders signal verdict, metrics, and walk-forward diagnostic rows', () => {
    render(<VolatilityDcaVisualizer initialPrice={60000} />);

    expect(screen.getByText('Signal Verdict')).toBeInTheDocument();
    expect(screen.getByText('Net Sharpe (After Stress)')).toBeInTheDocument();
    expect(screen.getByText('W01: 2025-Q1')).toBeInTheDocument();
    expect(screen.getByText('W08: 2026-Q4')).toBeInTheDocument();
  });
});

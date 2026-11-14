import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategyStep } from './strategy-step';
import { type FormState } from './wizard-types';

const baseForm: FormState = {
  name: 'Bot', strategy: '', pair: 'BTC/USDT', exchange: 'binance', capital: 5000,
  config: { levels: 10, capital_per_level_pct: 10, max_drawdown_pct: 5 },
};

describe('StrategyStep', () => {
  const defaults = { onNext: vi.fn(), onPrev: vi.fn(), setStrategyDefaults: vi.fn() };

  it('renders both strategies', () => {
    render(<StrategyStep form={baseForm} {...defaults} />);
    expect(screen.getByText(/grid/i)).toBeInTheDocument();
    expect(screen.getByText(/mean reversion/i)).toBeInTheDocument();
  });

  it('next button disabled when no strategy selected', () => {
    render(<StrategyStep form={baseForm} {...defaults} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('enables next when strategy is selected', () => {
    render(<StrategyStep form={{ ...baseForm, strategy: 'grid' }} {...defaults} />);
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('calls setStrategyDefaults on strategy click', async () => {
    const user = userEvent.setup();
    render(<StrategyStep form={baseForm} {...defaults} />);
    await user.click(screen.getByText(/grid/i));
    expect(defaults.setStrategyDefaults).toHaveBeenCalledWith('grid');
  });

  it('calls onPrev when back is clicked', async () => {
    const user = userEvent.setup();
    render(<StrategyStep form={baseForm} {...defaults} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(defaults.onPrev).toHaveBeenCalled();
  });

  it('renders UNVERIFIED_RETAIL_SANDBOX badges for retail strategies and PAPER_FORWARD_ELIGIBLE badge for h3_maker', async () => {
    const setStrategyDefaults = vi.fn();
    const user = userEvent.setup();
    render(<StrategyStep form={baseForm} {...defaults} setStrategyDefaults={setStrategyDefaults} />);

    expect(screen.getByTestId('tier-badge-grid')).toHaveTextContent('UNVERIFIED_RETAIL_SANDBOX');
    expect(screen.getByTestId('tier-badge-mean_reversion')).toHaveTextContent('UNVERIFIED_RETAIL_SANDBOX');
    expect(screen.getByTestId('tier-badge-volatility_dca')).toHaveTextContent('UNVERIFIED_RETAIL_SANDBOX');
    expect(screen.getByTestId('tier-badge-h3_maker')).toHaveTextContent('PAPER_FORWARD_ELIGIBLE');
    expect(screen.getByTestId('tier-badge-h3_maker')).toHaveTextContent('SignedStrategySpec • H3_MAKER');
    expect(screen.getAllByText(/Negative VIP-0 net expectancy/i)).toHaveLength(3);

    await user.click(screen.getByText(/H3 Maker Paper-Forward/i));
    expect(setStrategyDefaults).toHaveBeenCalledWith('h3_maker');
  });
});

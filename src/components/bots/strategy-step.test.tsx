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
});

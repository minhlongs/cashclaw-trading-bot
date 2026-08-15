import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigStep } from './config-step';
import { type FormState } from './wizard-types';

function makeForm(strategy: 'grid' | 'mean_reversion'): FormState {
  return {
    name: 'Bot',
    strategy,
    pair: 'BTC/USDT',
    exchange: 'binance',
    capital: 5000,
    config: strategy === 'grid'
      ? { levels: 10, capital_per_level_pct: 10, max_drawdown_pct: 5 }
      : { bb_period: 20, bb_std: 2, rsi_period: 14, rsi_buy: 30, rsi_sell: 70, volume_multiplier: 1.5, position_size_pct: 10, max_drawdown_pct: 5 },
  };
}

describe('ConfigStep', () => {
  const defaults = { onNext: vi.fn(), onPrev: vi.fn(), updateConfig: vi.fn() };

  it('shows grid fields when strategy is grid', () => {
    render(<ConfigStep form={makeForm('grid')} strategy="grid" {...defaults} />);
    expect(screen.getByText('Grid Config')).toBeInTheDocument();
    expect(screen.getByText('Levels')).toBeInTheDocument();
  });

  it('shows mean-rev fields when strategy is mean_reversion', () => {
    render(<ConfigStep form={makeForm('mean_reversion')} strategy="mean_reversion" {...defaults} />);
    expect(screen.getByText('Mean Reversion Config')).toBeInTheDocument();
    expect(screen.getByText('BB Period')).toBeInTheDocument();
  });

  it('calls onNext when next is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfigStep form={makeForm('grid')} strategy="grid" {...defaults} />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(defaults.onNext).toHaveBeenCalled();
  });

  it('calls onPrev when back is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfigStep form={makeForm('grid')} strategy="grid" {...defaults} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(defaults.onPrev).toHaveBeenCalled();
  });
});

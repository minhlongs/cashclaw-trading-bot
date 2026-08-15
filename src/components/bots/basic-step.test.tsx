import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BasicStep } from './basic-step';
import { type FormState } from './wizard-types';

function emptyForm(): FormState {
  return {
    name: '', strategy: '', pair: '', exchange: '', capital: 0,
    config: { levels: 10, capital_per_level_pct: 10, max_drawdown_pct: 5 },
  };
}

describe('BasicStep', () => {
  const defaults = { onNext: vi.fn(), update: vi.fn() };

  it('next is disabled when fields are missing', () => {
    render(<BasicStep form={emptyForm()} {...defaults} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('next is enabled when all fields are filled', () => {
    const form = { ...emptyForm(), name: 'Bot', pair: 'BTC/USDT', exchange: 'binance' };
    render(<BasicStep form={form} {...defaults} />);
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  it('calls onNext when next is clicked', async () => {
    const user = userEvent.setup();
    const form = { ...emptyForm(), name: 'Bot', pair: 'BTC/USDT', exchange: 'binance' };
    render(<BasicStep form={form} {...defaults} />);
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(defaults.onNext).toHaveBeenCalled();
  });

  it('calls update when bot name is typed', async () => {
    const user = userEvent.setup();
    render(<BasicStep form={emptyForm()} {...defaults} />);
    await user.type(screen.getByPlaceholderText('BTC Grid v2'), 'X');
    expect(defaults.update).toHaveBeenCalled();
  });

  it('renders pair and exchange selects', () => {
    render(<BasicStep form={emptyForm()} {...defaults} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });
});

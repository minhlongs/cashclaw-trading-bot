import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrategySettings } from './strategy-settings';

const defaultRisk = {
  maxDrawdownPct: 15,
  dailyLossLimitPct: 10,
  cooldownMinutes: 30,
  maxOpenOrders: 50,
};

function setup(overrides = {}) {
  return {
    user: userEvent.setup(),
    risk: { ...defaultRisk },
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('StrategySettings', () => {
  it('renders all risk parameter fields', () => {
    render(<StrategySettings {...setup()} />);
    expect(screen.getByText(/Max Drawdown/)).toBeInTheDocument();
    expect(screen.getByText(/Daily Loss Limit/)).toBeInTheDocument();
    expect(screen.getByText(/Cooldown/)).toBeInTheDocument();
    expect(screen.getByText(/Max Open Orders/)).toBeInTheDocument();
  });

  it('displays initial risk values', () => {
    render(<StrategySettings {...setup()} />);
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('calls onSave with updated risk config', async () => {
    const { user, risk } = setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<StrategySettings risk={risk} onSave={onSave} />);

    const dailyLossInput = screen.getByDisplayValue('10');
    await user.clear(dailyLossInput);
    await user.type(dailyLossInput, '20');

    await user.click(screen.getByRole('button', { name: /save parameters/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ dailyLossLimitPct: 20 })
      );
    });
  });

  it('disables save button while saving', async () => {
    const { user, risk } = setup();
    const onSave = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    render(<StrategySettings risk={risk} onSave={onSave} />);

    const button = screen.getByRole('button', { name: /save parameters/i });
    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('shows loading spinner while saving', async () => {
    const { user, risk } = setup();
    const onSave = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    render(<StrategySettings risk={risk} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /save parameters/i }));

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  it('re-enables save button after save completes', async () => {
    const { user, risk } = setup();
    render(<StrategySettings risk={risk} onSave={vi.fn().mockResolvedValue(undefined)} />);

    const button = screen.getByRole('button', { name: /save parameters/i });
    await user.click(button);
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });
});

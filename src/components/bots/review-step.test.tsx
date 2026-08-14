import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReviewStep } from './review-step';
import { type FormState } from './wizard-types';

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    name: 'Grid Bot',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    capital: 5000,
    config: { levels: 10, capital_per_level_pct: 10, max_drawdown_pct: 5 },
    ...overrides,
  };
}

const defaultProps = {
  form: makeForm(),
  submitting: false,
  submitError: null,
  submitSuccess: false,
  onSubmit: vi.fn(),
  onPrev: vi.fn(),
};

describe('ReviewStep', () => {
  it('renders the bot name', () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText('Grid Bot')).toBeInTheDocument();
  });

  it('displays strategy as label from STRATEGIES', () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText('Grid Trading')).toBeInTheDocument();
  });

  it('displays pair and exchange as uppercase', () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText('BTC/USDT')).toBeInTheDocument();
    expect(screen.getByText('BINANCE')).toBeInTheDocument();
  });

  it('shows grid config field labels and values', () => {
    render(<ReviewStep {...defaultProps} />);
    expect(screen.getByText('Levels')).toBeInTheDocument();
    expect(screen.getByText('Capital per level (%)')).toBeInTheDocument();
    expect(screen.getByText('Max Drawdown (%)')).toBeInTheDocument();
    expect(screen.getByText('Spacing (%)')).toBeInTheDocument();
    expect(screen.getAllByText('10').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows mean reversion config fields for mean_reversion strategy', () => {
    const form = makeForm({ strategy: 'mean_reversion', config: { bb_period: 20, bb_std: 2 } });
    render(<ReviewStep {...defaultProps} form={form} />);
    expect(screen.getByText('BB Period')).toBeInTheDocument();
    expect(screen.getByText('BB Std Dev')).toBeInTheDocument();
    expect(screen.getAllByText('20').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls onSubmit when create button clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReviewStep {...defaultProps} onSubmit={onSubmit} />);
    await user.click(screen.getByText(/create bot/i));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('calls onPrev when back button clicked', async () => {
    const user = userEvent.setup();
    const onPrev = vi.fn();
    render(<ReviewStep {...defaultProps} onPrev={onPrev} />);
    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('shows error message when submitError is set', () => {
    render(<ReviewStep {...defaultProps} submitError="API limit reached" />);
    expect(screen.getByText('API limit reached')).toBeInTheDocument();
  });

  it('disables buttons while submitting', () => {
    const { container } = render(<ReviewStep {...defaultProps} submitting={true} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0]).toBeDisabled(); // Back button
    expect(buttons[1]).toBeDisabled(); // Create Bot button (shows spinner when submitting)
  });

  it('hides create button on success', () => {
    render(<ReviewStep {...defaultProps} submitSuccess={true} />);
    expect(screen.queryByRole('button', { name: /create bot/i })).not.toBeInTheDocument();
  });

  it('disables back button on success', () => {
    render(<ReviewStep {...defaultProps} submitSuccess={true} />);
    expect(screen.getByRole('button', { name: /back/i })).toBeDisabled();
  });

  it('shows loading spinner while submitting', () => {
    const { container } = render(<ReviewStep {...defaultProps} submitting={true} />);
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KillswitchSettings } from './killswitch-settings';

describe('KillswitchSettings', () => {
  it('renders title, description, and active badge when enabled is true', () => {
    render(
      <KillswitchSettings enabled={true} onHalt={vi.fn()} onResume={vi.fn()} />
    );
    expect(screen.getByText('Kill Switch')).toBeInTheDocument();
    expect(screen.getByText(/immediately halt all trading/i)).toBeInTheDocument();
    const badge = screen.getByText('ACTIVE');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge-neutral');
  });

  it('renders halted badge and correct button states when enabled is false', () => {
    render(
      <KillswitchSettings enabled={false} onHalt={vi.fn()} onResume={vi.fn()} />
    );
    const badge = screen.getByText('HALTED');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge-error');
    expect(screen.getByRole('button', { name: /halt all trading/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /resume trading/i })).toBeEnabled();
  });

  it('disables resume button and enables halt button when enabled is true', () => {
    render(
      <KillswitchSettings enabled={true} onHalt={vi.fn()} onResume={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /halt all trading/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /resume trading/i })).toBeDisabled();
  });

  it('calls onHalt when Halt button is clicked while enabled', async () => {
    const onHalt = vi.fn();
    const user = userEvent.setup();
    render(
      <KillswitchSettings enabled={true} onHalt={onHalt} onResume={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: /halt all trading/i }));
    expect(onHalt).toHaveBeenCalledTimes(1);
  });

  it('calls onResume when Resume button is clicked while disabled', async () => {
    const onResume = vi.fn();
    const user = userEvent.setup();
    render(
      <KillswitchSettings enabled={false} onHalt={vi.fn()} onResume={onResume} />
    );
    await user.click(screen.getByRole('button', { name: /resume trading/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons and displays Loader2 spinner when isSaving is true', () => {
    render(
      <KillswitchSettings
        enabled={true}
        onHalt={vi.fn()}
        onResume={vi.fn()}
        isSaving={true}
      />
    );
    expect(screen.getByRole('button', { name: /halt all trading/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /resume trading/i })).toBeDisabled();
    const spinners = document.querySelectorAll('.animate-spin');
    expect(spinners.length).toBe(2);
  });
});

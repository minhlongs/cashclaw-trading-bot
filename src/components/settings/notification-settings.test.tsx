import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationSettings } from './notification-settings';

const defaultProps = {
  telegram: { botToken: 'existing-token', chatId: '12345' },
  onSave: vi.fn().mockResolvedValue(undefined),
};

function setup(overrides = {}) {
  return { user: userEvent.setup(), ...defaultProps, ...overrides };
}

describe('NotificationSettings', () => {
  it('renders telegram inputs with initial values', () => {
    render(<NotificationSettings {...setup()} />);
    expect(screen.getByDisplayValue('existing-token')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12345')).toBeInTheDocument();
  });

  it('disables save button when bot token is empty', () => {
    render(
      <NotificationSettings
        telegram={{ botToken: '', chatId: '12345' }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /save telegram/i })).toBeDisabled();
  });

  it('disables save button when chat id is empty', () => {
    render(
      <NotificationSettings
        telegram={{ botToken: 'token', chatId: '' }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /save telegram/i })).toBeDisabled();
  });

  it('calls onSave with updated values', async () => {
    const { user } = setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<NotificationSettings {...defaultProps} onSave={onSave} />);

    const tokenInput = screen.getByDisplayValue('existing-token');
    await user.clear(tokenInput);
    await user.type(tokenInput, 'new-token');

    const chatInput = screen.getByDisplayValue('12345');
    await user.clear(chatInput);
    await user.type(chatInput, '67890');

    await user.click(screen.getByRole('button', { name: /save telegram/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('new-token', '67890');
    });
  });

  it('disables save button while saving', async () => {
    const { user } = setup();
    const onSave = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    render(<NotificationSettings {...defaultProps} onSave={onSave} />);

    const button = screen.getByRole('button', { name: /save telegram/i });
    await user.click(button);

    // After click, button text changes to a spinner icon — query by role before saving
    // then wait for the disabled attribute to appear
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
  });

  it('re-enables save button after save completes', async () => {
    const { user } = setup();
    render(<NotificationSettings {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: /save telegram/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save telegram/i })).not.toBeDisabled();
    });
  });
});

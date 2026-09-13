import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExchangeSettings } from './exchange-settings';
import type { SettingsData } from '@/forest/settings/actions';

vi.mock('lucide-react', () => ({
  Shield: () => <svg data-testid="icon-shield" />,
  Key: () => <svg data-testid="icon-key" />,
  Loader2: () => <svg data-testid="icon-loader" />,
}));

const mockExchanges: SettingsData['exchanges'] = {
  binance: { apiKey: '', apiSecret: '', testnet: true },
  bybit: { apiKey: 'key123', apiSecret: 'secret456', testnet: true },
  okx: { apiKey: 'key789', apiSecret: 'secret012', testnet: false },
};

const mockOnSave = vi.fn().mockResolvedValue(undefined);

function renderExchangeSettings(overrides?: {
  exchanges?: SettingsData['exchanges'];
  onSave?: typeof mockOnSave;
}) {
  return render(
    <ExchangeSettings
      exchanges={overrides?.exchanges ?? mockExchanges}
      onSave={overrides?.onSave ?? mockOnSave}
    />,
  );
}

describe('ExchangeSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all three exchanges with "Add" button when no API key', () => {
    renderExchangeSettings();
    expect(screen.getByText('binance')).toBeDefined();
    expect(screen.getByText('bybit')).toBeDefined();
    expect(screen.getByText('okx')).toBeDefined();
    expect(screen.getByText('Add')).toBeDefined();
  });

  it('shows "Configured" and "Testnet" badges based on exchange status', () => {
    renderExchangeSettings();
    expect(screen.getAllByText('Configured')).toHaveLength(2);
    expect(screen.getAllByText('Testnet')).toHaveLength(2);
  });

  it('opens edit form when "Add" or "Update" button clicked', async () => {
    const user = userEvent.setup();
    const { unmount } = renderExchangeSettings();
    await user.click(screen.getByText('Add'));
    expect(screen.getByPlaceholderText('API Key')).toBeDefined();
    expect(screen.getByPlaceholderText('API Secret')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
    unmount();

    renderExchangeSettings();
    await user.click(screen.getAllByText('Update')[0]);
    expect(screen.getByPlaceholderText('API Key')).toBeDefined();
  });

  it('populates edit form with current exchange values', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();
    await user.click(screen.getAllByText('Update')[0]);

    const apiKeyInput = screen.getByPlaceholderText('API Key') as HTMLInputElement;
    const apiSecretInput = screen.getByPlaceholderText('API Secret') as HTMLInputElement;
    const testnetCheckbox = screen.getByRole('checkbox') as HTMLInputElement;

    expect(apiKeyInput.value).toBe('key123');
    expect(apiSecretInput.value).toBe('secret456');
    expect(testnetCheckbox.checked).toBe(true);
  });

  it('calls onSave with correct args when Save clicked', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();
    await user.click(screen.getAllByText('Update')[1]);

    const apiKeyInput = screen.getByPlaceholderText('API Key');
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'newkey');
    await user.click(screen.getByText('Save'));

    expect(mockOnSave).toHaveBeenCalledWith('okx', 'newkey', 'secret012', false);
  });

  it('closes edit form after save completes', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();
    await user.click(screen.getAllByText('Update')[0]);
    await user.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.queryByPlaceholderText('API Key')).toBeNull());
  });

  it('closes edit form when Cancel clicked', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();
    await user.click(screen.getAllByText('Update')[0]);
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('API Key')).toBeNull();
  });

  it('shows loading spinner and disables save button while saving', async () => {
    let resolveSave!: () => void;
    const slowSave = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolveSave = r; }),
    );
    const user = userEvent.setup();
    renderExchangeSettings({ onSave: slowSave });

    await user.click(screen.getAllByText('Update')[0]);
    const saveBtn = screen.getByText('Save').closest('button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    await user.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByTestId('icon-loader')).toBeDefined();
      expect(saveBtn.disabled).toBe(true);
    });
    resolveSave();
  });

  it('disables save when fields are empty', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();
    await user.click(screen.getByText('Add'));
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
  });
});

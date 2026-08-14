import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExchangeSettings } from './exchange-settings';
import type { SettingsData } from '@/forest/settings/actions';

vi.mock('lucide-react', () => ({
  Shield: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-shield" {...props} />
  ),
  Key: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-key" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
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
    />
  );
}

describe('ExchangeSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all three exchanges with "Add" button when no API key', () => {
    renderExchangeSettings();
    expect(screen.getByText('binance')).toBeDefined();
    expect(screen.getByText('bybit')).toBeDefined();
    expect(screen.getByText('okx')).toBeDefined();
    // binance has no key, so it shows "Add"
    expect(screen.getByText('Add')).toBeDefined();
  });

  it('shows "Configured" badge when exchange has API key', () => {
    renderExchangeSettings();
    const configuredBadges = screen.getAllByText('Configured');
    // bybit and okx have API keys
    expect(configuredBadges.length).toBe(2);
  });

  it('shows "Testnet" badge when exchange has testnet=true', () => {
    renderExchangeSettings();
    // binance (testnet=true, no key) and bybit (testnet=true, has key)
    const testnetBadges = screen.getAllByText('Testnet');
    expect(testnetBadges.length).toBe(2);
  });

  it('does not show "Testnet" badge when exchange has testnet=false', () => {
    renderExchangeSettings();
    // okx has testnet=false, so no third Testnet badge
    const testnetBadges = screen.getAllByText('Testnet');
    expect(testnetBadges.length).toBe(2);
  });

  it('opens edit form when "Add" button clicked', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    await user.click(screen.getByText('Add'));

    expect(screen.getByPlaceholderText('API Key')).toBeDefined();
    expect(screen.getByPlaceholderText('API Secret')).toBeDefined();
    expect(screen.getByText('Save')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
  });

  it('opens edit form when "Update" button clicked', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    // bybit is the first configured exchange
    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[0]);

    expect(screen.getByPlaceholderText('API Key')).toBeDefined();
  });

  it('populates edit form with current exchange values', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    // Click Update on bybit (first configured exchange with key123/secret456/testnet=true)
    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[0]);

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

    // Click Update on okx (second configured exchange, key789/secret012/testnet=false)
    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[1]);

    // Modify API key
    const apiKeyInput = screen.getByPlaceholderText('API Key');
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'newkey');

    await user.click(screen.getByText('Save'));

    expect(mockOnSave).toHaveBeenCalledWith('okx', 'newkey', 'secret012', false);
  });

  it('closes edit form after save completes', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[0]);

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('API Key')).toBeNull();
    });
  });

  it('closes edit form when Cancel clicked', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[0]);

    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByPlaceholderText('API Key')).toBeNull();
  });

  it('shows loading spinner while saving', async () => {
    let resolveSave!: () => void;
    const slowSave = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve; })
    );

    const user = userEvent.setup();
    renderExchangeSettings({ onSave: slowSave });

    // Click Update on bybit — fields prefill, so Save is enabled
    const updateButtons = screen.getAllByText('Update');
    await user.click(updateButtons[0]);

    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByTestId('icon-loader')).toBeDefined();
    });

    resolveSave();
  });

  it('disables save button while saving', async () => {
    let resolveSave!: () => void;
    const slowSave = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolveSave = resolve; })
    );

    const user = userEvent.setup();
    renderExchangeSettings({ onSave: slowSave });

    await user.click(screen.getByText('Add'));

    // Fill in both fields so the disabled condition is only `saving`
    await user.type(screen.getByPlaceholderText('API Key'), 'mykey');
    await user.type(screen.getByPlaceholderText('API Secret'), 'mysecret');

    // Capture the node before clicking — its label swaps to a spinner while saving
    const saveBtn = screen.getByText('Save').closest('button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);

    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveBtn.disabled).toBe(true);
    });

    resolveSave();
  });

  it('disables save when fields are empty', async () => {
    const user = userEvent.setup();
    renderExchangeSettings();

    await user.click(screen.getByText('Add'));

    const saveBtn = screen.getByText('Save').closest('button');
    expect(saveBtn).toBeDisabled();
  });
});

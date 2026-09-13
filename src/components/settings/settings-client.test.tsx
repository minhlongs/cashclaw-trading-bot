import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsClient } from './settings-client';
import type { SettingsData } from '@/forest/settings/actions';

vi.mock('./exchange-settings', () => ({
  ExchangeSettings: ({ onSave }: { onSave: (e: string, k: string, s: string, t: boolean) => void }) => (
    <div data-testid="exchange-settings">
      <button data-testid="mock-save-exchange" onClick={() => onSave('binance', 'key', 'secret', true)}>
        Save
      </button>
    </div>
  ),
}));

vi.mock('./notification-settings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));

vi.mock('./strategy-settings', () => ({
  StrategySettings: ({ onSave }: { onSave: (r: SettingsData['risk']) => void }) => (
    <div data-testid="strategy-settings">
      <button
        data-testid="mock-save-strategy"
        onClick={() => onSave({ maxDrawdownPct: 20, dailyLossLimitPct: 10, cooldownMinutes: 30, maxOpenOrders: 5 })}
      >
        Save
      </button>
    </div>
  ),
}));

const emptyEx = { apiKey: '', apiSecret: '', testnet: true };
const LOADED_SETTINGS: SettingsData = {
  exchanges: {
    binance: { apiKey: 'bk', apiSecret: 'bs', testnet: true },
    bybit: { ...emptyEx },
    okx: { ...emptyEx },
  },
  risk: { maxDrawdownPct: 15, dailyLossLimitPct: 10, cooldownMinutes: 60, maxOpenOrders: 10 },
  notification: { botToken: '', chatId: '' },
  killswitch: { enabled: true, reason: null, triggeredAt: null },
  killswitchDaily: { dailyPnl: 0, consecutiveLosses: 0, peakCapital: 0, dailyStartTime: 0 },
};

type FetchInit = RequestInit | undefined;
const jsonRes = (b: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(b) });

function stubFetch(postBody: unknown = { ok: true }) {
  const impl = vi.fn((_url: string, init: FetchInit) =>
    init?.method === 'POST' ? jsonRes(postBody) : jsonRes({ ok: true, data: LOADED_SETTINGS }),
  );
  vi.stubGlobal('fetch', impl);
  return impl;
}

function findPost(mock: ReturnType<typeof vi.fn>, key: string, val: unknown) {
  for (const [url, init] of mock.mock.calls as [string, FetchInit][]) {
    if (url !== '/api/settings' || init?.method !== 'POST') continue;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    if (body[key] === val) return body;
  }
}

describe('SettingsClient', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('shows spinner while loading, falls back on reject, tolerates non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { unmount } = render(<SettingsClient />);
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByTestId('exchange-settings')).toBeNull();
    unmount();

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fail'))));
    const { unmount: u2 } = render(<SettingsClient />);
    await waitFor(() => expect(screen.getByTestId('exchange-settings')).toBeTruthy());
    expect(screen.getByText('HALTED')).toBeTruthy();
    expect(screen.getByRole('button', { name: /halt all trading/i })).toBeDisabled();
    u2();

    vi.stubGlobal('fetch', vi.fn(() => jsonRes({ ok: false }, false)));
    render(<SettingsClient />);
    await waitFor(() => expect(screen.getByTestId('exchange-settings')).toBeTruthy());
  });

  it('renders all settings sections after load', async () => {
    stubFetch();
    render(<SettingsClient />);
    await waitFor(() => expect(screen.getByTestId('exchange-settings')).toBeTruthy());
    expect(screen.getByTestId('notification-settings')).toBeTruthy();
    expect(screen.getByTestId('strategy-settings')).toBeTruthy();
    expect(screen.getByText('Kill Switch')).toBeTruthy();
  });

  it('posts type exchange and risk when forms are saved', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<SettingsClient />);
    await waitFor(() => expect(screen.getByTestId('mock-save-exchange')).toBeTruthy());
    await user.click(screen.getByTestId('mock-save-exchange'));
    await waitFor(() => {
      expect(findPost(fetchMock, 'type', 'exchange')).toMatchObject({
        exchange: 'binance',
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: true,
      });
    });

    await user.click(screen.getByTestId('mock-save-strategy'));
    await waitFor(() => {
      expect(findPost(fetchMock, 'type', 'risk')).toMatchObject({
        maxDrawdownPct: 20,
        dailyLossLimitPct: 10,
        cooldownMinutes: 30,
        maxOpenOrders: 5,
      });
    });
  });

  it('handles halt and resume killswitch toggling', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<SettingsClient />);
    const haltBtn = await screen.findByRole('button', { name: /halt all trading/i });
    await user.click(haltBtn);
    await waitFor(() => expect(findPost(fetchMock, 'action', 'halt')).toBeDefined());
    expect(await screen.findByText('Trading halted')).toBeTruthy();
    expect(screen.getByText('HALTED')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /resume trading/i }));
    await waitFor(() => expect(findPost(fetchMock, 'action', 'resume')).toBeDefined());
    expect(await screen.findByText('Trading resumed')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('handles save feedback: success, server error, and network error', async () => {
    const user = userEvent.setup();
    stubFetch({ ok: true });
    const { unmount } = render(<SettingsClient />);
    await user.click(await screen.findByTestId('mock-save-exchange'));
    expect(await screen.findByText('binance saved!')).toBeTruthy();
    unmount();

    stubFetch({ ok: false, error: 'invalid key' });
    const { unmount: u2 } = render(<SettingsClient />);
    await user.click(await screen.findByTestId('mock-save-exchange'));
    expect(await screen.findByText('invalid key')).toBeTruthy();
    u2();

    stubFetch({ ok: false });
    const { unmount: u3 } = render(<SettingsClient />);
    await user.click(await screen.findByTestId('mock-save-exchange'));
    expect(await screen.findByText('binance save failed')).toBeTruthy();
    u3();

    vi.stubGlobal('fetch', vi.fn((_u, init: FetchInit) =>
      init?.method === 'POST' ? Promise.reject(new Error()) : jsonRes({ ok: true, data: LOADED_SETTINGS }),
    ));
    render(<SettingsClient />);
    await user.click(await screen.findByTestId('mock-save-exchange'));
    expect(await screen.findByText('Network error')).toBeTruthy();
  });

  it('disables killswitch buttons while request is in flight', async () => {
    let releasePost!: () => void;
    const gate = new Promise<void>((r) => { releasePost = r; });
    vi.stubGlobal('fetch', vi.fn((_u, init: FetchInit) =>
      init?.method === 'POST' ? gate.then(() => jsonRes({ ok: true })) : jsonRes({ ok: true, data: LOADED_SETTINGS }),
    ));
    const user = userEvent.setup();
    render(<SettingsClient />);
    const haltBtn = await screen.findByRole('button', { name: /halt all trading/i });
    await user.click(haltBtn);
    await waitFor(() => expect(haltBtn).toBeDisabled());
    releasePost();
  });
});

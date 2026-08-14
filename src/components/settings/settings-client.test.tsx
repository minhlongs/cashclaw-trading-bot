import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsClient } from './settings-client';
import type { SettingsData } from '@/forest/settings/actions';

/* ------------------------------------------------------------------ */
/*  Child component mocks — simple divs to avoid cascading mocks       */
/* ------------------------------------------------------------------ */

vi.mock('./exchange-settings', () => ({
  ExchangeSettings: ({
    onSave,
  }: {
    onSave: (
      exchange: string,
      apiKey: string,
      apiSecret: string,
      testnet: boolean,
    ) => void;
  }) => (
    <div data-testid="exchange-settings">
      <button
        data-testid="mock-save-exchange"
        onClick={() => onSave('binance', 'key', 'secret', true)}
      >
        Mock Save Exchange
      </button>
    </div>
  ),
}));

vi.mock('./notification-settings', () => ({
  NotificationSettings: () => <div data-testid="notification-settings" />,
}));

vi.mock('./strategy-settings', () => ({
  StrategySettings: ({
    onSave,
  }: {
    onSave: (risk: SettingsData['risk']) => void;
  }) => (
    <div data-testid="strategy-settings">
      <button
        data-testid="mock-save-strategy"
        onClick={() =>
          onSave({
            maxDrawdownPct: 20,
            dailyLossLimitPct: 10,
            cooldownMinutes: 30,
            maxOpenOrders: 5,
          })
        }
      >
        Mock Save Strategy
      </button>
    </div>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Fixtures & fetch helpers                                          */
/* ------------------------------------------------------------------ */

const LOADED_SETTINGS: SettingsData = {
  exchanges: {
    binance: { apiKey: 'bk', apiSecret: 'bs', testnet: true },
    bybit: { apiKey: '', apiSecret: '', testnet: true },
    okx: { apiKey: '', apiSecret: '', testnet: true },
  },
  risk: {
    maxDrawdownPct: 15,
    dailyLossLimitPct: 10,
    cooldownMinutes: 60,
    maxOpenOrders: 10,
  },
  killswitch: { enabled: false, reason: null, triggeredAt: null },
};

type FetchInit = RequestInit | undefined;

function jsonResponse(body: unknown, httpOk = true) {
  return Promise.resolve({ ok: httpOk, json: () => Promise.resolve(body) });
}

/**
 * Routes GET /api/settings (initial load) separately from POST /api/settings
 * (mutations), because the component reuses one URL for both.
 */
function stubFetch(postBody: unknown = { ok: true }) {
  const impl = vi.fn((_url: string, init: FetchInit) => {
    if (init?.method === 'POST') return jsonResponse(postBody);
    return jsonResponse({ ok: true, data: LOADED_SETTINGS });
  });
  vi.stubGlobal('fetch', impl);
  return impl;
}

/** Returns the parsed body of the first POST whose `action` matches. */
function findPostByAction(
  mock: ReturnType<typeof vi.fn>,
  action: string,
): Record<string, unknown> | undefined {
  for (const [url, init] of mock.mock.calls as [string, FetchInit][]) {
    if (url !== '/api/settings' || init?.method !== 'POST') continue;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    if (body.action === action) return body;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('SettingsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows a spinner while settings are loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve(jsonResponse({ ok: true, data: LOADED_SETTINGS })),
              500,
            ),
          ),
      ),
    );

    render(<SettingsClient />);

    // Loading branch renders a lone Loader2 icon with the animate-spin class
    expect(document.querySelector('.animate-spin')).toBeTruthy();
    expect(screen.queryByTestId('exchange-settings')).toBeNull();
  });

  it('falls back to safe defaults when the settings fetch rejects', async () => {
    // NOTE: the component swallows load errors by design — there is no error
    // banner and no retry button. It degrades to DEFAULT_SETTINGS instead.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('Network failure'))),
    );

    render(<SettingsClient />);

    await waitFor(() => {
      expect(screen.getByTestId('exchange-settings')).toBeTruthy();
    });

    // Killswitch default is disabled -> ACTIVE badge, both controls usable
    expect(screen.getByText('ACTIVE')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /halt all trading/i }),
    ).toBeEnabled();
  });

  it('tolerates a non-2xx settings response without crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ ok: false, error: 'unauthorized' }, false)),
    );

    render(<SettingsClient />);

    await waitFor(() => {
      expect(screen.getByTestId('exchange-settings')).toBeTruthy();
    });
  });

  it('renders exchange, notification, and strategy sections after load', async () => {
    stubFetch();

    render(<SettingsClient />);

    await waitFor(() => {
      expect(screen.getByTestId('exchange-settings')).toBeTruthy();
    });
    expect(screen.getByTestId('notification-settings')).toBeTruthy();
    expect(screen.getByTestId('strategy-settings')).toBeTruthy();
  });

  it('posts action save-exchange with the submitted credentials', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-exchange')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-exchange'));

    await waitFor(() => {
      const body = findPostByAction(fetchMock, 'save-exchange');
      expect(body).toBeDefined();
      expect(body!.exchange).toBe('binance');
      expect(body!.data).toEqual({
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: true,
      });
    });
  });

  it('posts action save-risk when the strategy section saves', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-strategy')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-strategy'));

    await waitFor(() => {
      const body = findPostByAction(fetchMock, 'save-risk');
      expect(body).toBeDefined();
      expect(body!.data).toEqual({
        risk: {
          maxDrawdownPct: 20,
          dailyLossLimitPct: 10,
          cooldownMinutes: 30,
          maxOpenOrders: 5,
        },
      });
    });
  });

  it('sends action halt and flags the killswitch when Halt is clicked', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /halt all trading/i }),
      ).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /halt all trading/i }));

    await waitFor(() => {
      expect(findPostByAction(fetchMock, 'halt')).toBeDefined();
    });
    expect(await screen.findByText('Trading halted')).toBeTruthy();
    expect(screen.getByText('HALTED')).toBeTruthy();
  });

  it('sends action resume and clears the killswitch when Resume is clicked', async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /resume trading/i }),
      ).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /resume trading/i }));

    await waitFor(() => {
      expect(findPostByAction(fetchMock, 'resume')).toBeDefined();
    });
    expect(await screen.findByText('Trading resumed')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('shows a success message after a successful exchange save', async () => {
    stubFetch({ ok: true });
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-exchange')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-exchange'));

    expect(await screen.findByText('binance saved!')).toBeTruthy();
  });

  it('surfaces the server error message when a save fails', async () => {
    stubFetch({ ok: false, error: 'invalid api key' });
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-exchange')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-exchange'));

    expect(await screen.findByText('invalid api key')).toBeTruthy();
  });

  it('falls back to a generic failure message when the server omits one', async () => {
    stubFetch({ ok: false });
    const user = userEvent.setup();

    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-exchange')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-exchange'));

    expect(await screen.findByText('binance save failed')).toBeTruthy();
  });

  it('shows a network error message when a save request rejects', async () => {
    const impl = vi.fn((_url: string, init: FetchInit) => {
      if (init?.method === 'POST') return Promise.reject(new Error('offline'));
      return jsonResponse({ ok: true, data: LOADED_SETTINGS });
    });
    vi.stubGlobal('fetch', impl);

    const user = userEvent.setup();
    render(<SettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-save-exchange')).toBeTruthy();
    });

    await user.click(screen.getByTestId('mock-save-exchange'));

    expect(await screen.findByText('Network error')).toBeTruthy();
  });

  it('disables the killswitch buttons while a killswitch request is in flight', async () => {
    let releasePost!: () => void;
    const gate = new Promise<void>((resolve) => {
      releasePost = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: FetchInit) => {
        if (init?.method === 'POST') {
          return gate.then(() => jsonResponse({ ok: true }));
        }
        return jsonResponse({ ok: true, data: LOADED_SETTINGS });
      }),
    );

    const user = userEvent.setup();
    render(<SettingsClient />);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /halt all trading/i }),
      ).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: /halt all trading/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /resume trading/i }),
      ).toBeDisabled();
    });

    releasePost();
  });
});

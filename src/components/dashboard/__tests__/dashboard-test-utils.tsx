import { vi } from 'vitest';
import type React from 'react';

export function setupDashboardMocks() {
  vi.mock('next-intl', () => ({
    useTranslations: () => (key: string) => key,
    useLocale: () => 'vi',
  }));

  vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
  }));

  vi.mock('next/link', () => ({
    default: ({
      children,
      href,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode; href: string }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  }));
}

export interface BotCardDataApi {
  id: string;
  name: string;
  strategy: 'grid' | 'mean_reversion' | 'volatility_dca' | string;
  pair: string;
  exchange: string;
  status: string;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  startedAt: number | null;
  updatedAt: number;
  capitalAllocated: number;
}

export function makeApiBot(overrides: Partial<BotCardDataApi> = {}): BotCardDataApi {
  return {
    id: 'bot-1',
    name: 'Grid BTC',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'running',
    totalPnl: 123.45,
    winCount: 10,
    lossCount: 3,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_100_000_000,
    capitalAllocated: 5000,
    ...overrides,
  };
}

export function jsonResponse(ok: boolean, data?: BotCardDataApi[] | null, error?: string | null) {
  return {
    ok: true,
    json: () => Promise.resolve({ ok, data: data ?? null, error: error ?? null }),
  };
}

export function httpError(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ ok: false, error: `HTTP ${status}` }),
  };
}

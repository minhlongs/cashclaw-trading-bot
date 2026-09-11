import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrategyVisualizerCard } from './strategy-visualizer-card';
import type { BotCardData } from '@/forest/dashboard/actions';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Strategy Allocation & Performance',
      subtitle: 'Real-time breakdown across active quantitative models',
      noStrategies: 'No active strategies',
      grid: 'Grid Trading',
      meanReversion: 'Mean Reversion',
      volatilityDca: 'Volatility DCA',
      allocated: 'Allocated Capital',
      pnl: 'Strategy P&L',
      winRate: 'Win Rate',
      activeBots: 'Active Bots',
    };
    return translations[key] ?? key;
  },
}));

function makeBot(overrides: Partial<BotCardData> = {}): BotCardData {
  return {
    id: 'bot-1',
    name: 'Bot 1',
    strategy: 'grid',
    pair: 'BTC/USDT',
    exchange: 'binance',
    botStatus: 'running',
    totalPnl: 100,
    winCount: 7,
    lossCount: 3,
    startedAt: 1_700_000_000,
    updatedAt: 1_700_100_000,
    capitalAllocated: 1000,
    maxDrawdownPct: 5,
    ...overrides,
  };
}

describe('StrategyVisualizerCard', () => {
  it('renders graceful empty state when bots list is empty', () => {
    render(<StrategyVisualizerCard bots={[]} />);
    expect(screen.getByText('Strategy Allocation & Performance')).toBeInTheDocument();
    expect(screen.getByText('No active strategies')).toBeInTheDocument();
  });

  it('aggregates and renders multi-strategy bot breakdown', () => {
    const bots: BotCardData[] = [
      makeBot({ id: 'g1', strategy: 'grid', capitalAllocated: 1000, totalPnl: 120, winCount: 8, lossCount: 2, botStatus: 'running' }),
      makeBot({ id: 'g2', strategy: 'grid', capitalAllocated: 2000, totalPnl: -20, winCount: 2, lossCount: 2, botStatus: 'paused' }),
      makeBot({ id: 'm1', strategy: 'mean_reversion', capitalAllocated: 1500, totalPnl: -75, winCount: 3, lossCount: 7, botStatus: 'running' }),
      makeBot({ id: 'v1', strategy: 'volatility_dca', capitalAllocated: 2500, totalPnl: 350, winCount: 9, lossCount: 1, botStatus: 'active' }),
    ];

    render(<StrategyVisualizerCard bots={bots} />);

    expect(screen.getByText('Grid Trading')).toBeInTheDocument();
    expect(screen.getByText('Mean Reversion')).toBeInTheDocument();
    expect(screen.getByText('Volatility DCA')).toBeInTheDocument();

    expect(screen.getByText('1/2 Active Bots')).toBeInTheDocument();
    expect(screen.getAllByText('1/1 Active Bots')).toHaveLength(2);

    expect(screen.getByText('$3,000')).toBeInTheDocument();
    expect(screen.getByText('$1,500')).toBeInTheDocument();
    expect(screen.getByText('$2,500')).toBeInTheDocument();
    expect(screen.getByText('Allocated Capital: $7,000')).toBeInTheDocument();

    expect(screen.getByText('71%')).toBeInTheDocument();
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('applies positive and negative PnL styling classes', () => {
    const bots: BotCardData[] = [
      makeBot({ id: 'p1', strategy: 'grid', totalPnl: 250 }),
      makeBot({ id: 'l1', strategy: 'mean_reversion', totalPnl: -180 }),
    ];

    render(<StrategyVisualizerCard bots={bots} />);

    const profitPnl = screen.getByText('$250');
    expect(profitPnl.className).toContain('text-profit');
    expect(profitPnl.className).not.toContain('text-loss');

    const lossPnl = screen.getByText('$-180');
    expect(lossPnl.className).toContain('text-loss');
    expect(lossPnl.className).not.toContain('text-profit');
  });

  it('handles edge cases with zero trades and custom strategy names', () => {
    const bots: BotCardData[] = [
      makeBot({ id: 'z1', strategy: 'custom_alpha', winCount: 0, lossCount: 0, totalPnl: NaN, capitalAllocated: NaN }),
    ];

    render(<StrategyVisualizerCard bots={bots} />);

    expect(screen.getByText('custom_alpha')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('Allocated Capital: $0')).toBeInTheDocument();
  });
});

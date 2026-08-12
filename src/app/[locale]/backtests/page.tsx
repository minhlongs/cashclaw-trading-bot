import { Metadata } from 'next';
import BacktestsClient from './backtests-client';
import { getBotCards } from '@/forest/dashboard/actions';

export const metadata: Metadata = {
  title: 'CashClaw — Backtest',
};

export default async function BacktestsPage() {
  const bots = await getBotCards();
  const initialBots = bots.map((b) => ({
    id: b.id,
    name: b.name,
    strategy: b.strategy,
    configJson: JSON.stringify({
      symbol: b.pair,
      exchange: b.exchange,
      capital: b.capitalAllocated,
      strategy: b.strategy,
      maxDrawdownPct: b.maxDrawdownPct,
    }),
  }));

  return (
    <div className="main-content">
      <div className="space-y-6">
        <div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 700 }}>Backtest</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
            Kiểm tra chiến lược trên dữ liệu lịch sử / Test strategies on historical data
          </p>
        </div>
      </div>
      <BacktestsClient initialBots={initialBots} />
    </div>
  );
}

import { Metadata } from 'next';
import { createServerClient } from '@/lib/db/client';
import { findBotsByUser } from '@/lib/db/repositories';
import { resolveBacktestSessionUser } from '@/forest/backtest/actions-persist';
import BacktestsClient, { type BotInfo } from './backtests-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

// Page reads D1 at request time to populate the authenticated user's bot selector.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CashClaw — Backtest',
};

export default async function BacktestsPage() {
  const db = createServerClient();
  const { userId } = await resolveBacktestSessionUser(db);
  const rows = db && userId ? await findBotsByUser(db, userId) : [];
  const initialBots: BotInfo[] = rows.map((bot) => ({
    id: bot.id,
    name: bot.name,
    strategy: bot.strategy,
    configJson: bot.config_json,
  }));

  return (
    <div className="main-content">
      <BacktestsClient initialBots={initialBots} />
    </div>
  );
}

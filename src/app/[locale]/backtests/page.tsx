import { Metadata } from 'next';
import { createServerClient } from '@/lib/db/client';
import { findAllBots } from '@/lib/db/repositories';
import BacktestsClient, { type BotInfo } from './backtests-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

// Page reads D1 at request time to populate the bot selector, so it must not
// be pre-rendered as static HTML (Cloudflare context is only available live).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'CashClaw — Backtest',
};

export default async function BacktestsPage() {
  const db = createServerClient();
  const rows = db ? await findAllBots(db) : [];
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

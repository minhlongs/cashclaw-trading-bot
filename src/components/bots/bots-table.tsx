import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { BotCardData } from '@/forest/dashboard/actions';
import { BotRowActions } from './bot-row-actions';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'badge-neutral',
    paper_test: 'badge-neutral',
    live_running: 'badge-running',
    paused: 'badge-paused',
    error: 'badge-error',
    stopped: 'badge-neutral',
    running: 'badge-running',
  };
  return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
}

function PnlValue({ value }: { value: number }) {
  const cls = value >= 0 ? 'text-profit' : 'text-loss';
  const prefix = value >= 0 ? '+' : '';
  return (
    <span className={`mono ${cls}`}>
      {prefix}{value.toFixed(2)}
    </span>
  );
}

export interface BotsTableProps {
  bots: BotCardData[];
  locale: string;
  onStatusChange: (botId: string, newStatus: string) => void;
  onError: (errorMsg: string) => void;
}

export function BotsTable({ bots, locale, onStatusChange, onError }: BotsTableProps) {
  const t = useTranslations();

  return (
    <div className="card card-no-pad">
      <div className="table-container table-container-plain">
        <table>
          <thead>
            <tr>
              <th>{t('bots.columns.name')}</th>
              <th>{t('bots.columns.strategy')}</th>
              <th>{t('bots.columns.pair')}</th>
              <th>Exchange</th>
              <th>{t('bots.columns.status')}</th>
              <th className="text-right">{t('bots.columns.pnl')}</th>
              <th className="text-right">{t('bots.columns.winRate')}</th>
              <th className="text-right">Capital</th>
              <th className="table-actions"></th>
            </tr>
          </thead>
          <tbody>
            {bots.map((bot) => {
              const total = bot.winCount + bot.lossCount;
              const wr = total > 0 ? `${((bot.winCount / total) * 100).toFixed(0)}%` : '—';
              return (
                <tr key={bot.id}>
                  <td>
                    <Link
                      href={`/${locale}/bots/${bot.id}`}
                      className="font-semibold link-accent"
                    >
                      {bot.name}
                    </Link>
                  </td>
                  <td>{t(`bots.strategy.${bot.strategy}`)}</td>
                  <td className="mono">{bot.pair}</td>
                  <td className="mono text-xs uppercase">{bot.exchange}</td>
                  <td><StatusBadge status={bot.botStatus} /></td>
                  <td className="text-right"><PnlValue value={bot.totalPnl} /></td>
                  <td className="text-right mono">{wr}</td>
                  <td className="text-right mono text-xs">
                    ${bot.capitalAllocated.toLocaleString()}
                  </td>
                  <td className="table-actions">
                    <BotRowActions
                      bot={bot}
                      locale={locale}
                      onStatusChange={onStatusChange}
                      onError={onError}
                    />
                  </td>
                </tr>
              );
            })}
            {bots.length === 0 && (
              <tr>
                <td colSpan={9} className="empty-state">
                  {t('bots.actions.noBotsFound')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

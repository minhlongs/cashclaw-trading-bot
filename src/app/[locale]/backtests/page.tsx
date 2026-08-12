import { Metadata } from 'next';
import BacktestsClient from './backtests-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Backtest',
};

export default function BacktestsPage() {
  return (
    <div className="main-content">
      <BacktestsClient />
    </div>
  );
}

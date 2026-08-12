import { Metadata } from 'next';
import LandingClient from './LandingClient';

export const metadata: Metadata = {
  title: 'CashClaw — Auto-Profit Trading Bot | Crypto Trading Bot',
  description: 'Automated crypto trading bot. Grid & Mean Reversion strategies. Runs 24/7 on Binance, Bybit, OKX.',
};

export default async function LandingPage() {
  return (
    <div className="landing-root">
      <LandingClient />
    </div>
  );
}

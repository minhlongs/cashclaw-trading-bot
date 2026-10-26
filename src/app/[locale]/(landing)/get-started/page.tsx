import { Metadata } from 'next';
import CtaClient from './CtaClient';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'Initialize Workspace — CashClaw Quant OS',
  description:
    'Configure your first simulated quantitative trading bot and causal walk-forward backtest in minutes.',
};

export default async function CtaPage() {
  return (
    <div className="landing-root">
      <CtaClient />
    </div>
  );
}

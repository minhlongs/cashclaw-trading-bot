import { Metadata } from 'next';
import { RegimeAttributionSimulator } from '@/components/quant/regime-attribution-simulator';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Regime-Conditional Alpha Attribution Simulator',
  description: 'Causal volatility regime attribution and multi-tier transaction cost stress simulator',
};

export default function RegimeAttributionPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <RegimeAttributionSimulator />
    </div>
  );
}

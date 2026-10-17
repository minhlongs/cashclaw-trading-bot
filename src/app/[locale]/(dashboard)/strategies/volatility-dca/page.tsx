import { Metadata } from 'next';
import { VolatilityDcaVisualizer } from '@/components/strategies/volatility-dca-visualizer';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — QuantLib Volatility-DCA Visualizer',
  description: 'Interactive signal attribution and walk-forward diagnostics for Volatility-Adjusted DCA',
};

export default function VolatilityDcaPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <VolatilityDcaVisualizer />
    </div>
  );
}

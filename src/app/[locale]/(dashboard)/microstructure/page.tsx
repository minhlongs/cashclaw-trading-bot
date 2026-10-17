import { Metadata } from 'next';
import { MicrostructureLiquidityAnalyzer } from '@/components/quant/microstructure-liquidity-analyzer';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Microstructure & L2 Liquidity Toxicity Analyzer',
  description: 'Real-time Order Flow Imbalance, VPIN toxicity, and L2 orderbook liquidity depth telemetry',
};

export default function MicrostructurePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <MicrostructureLiquidityAnalyzer />
    </div>
  );
}

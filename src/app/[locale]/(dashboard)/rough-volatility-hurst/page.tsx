import { Metadata } from 'next';
import { RoughVolatilityHurstDetector } from '@/components/quant/rough-volatility-hurst-detector';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Gatheral Rough Volatility Hurst & Bipower Jump Detector',
  description: 'Fractional Brownian motion Hurst exponent estimator and Barndorff-Nielsen-Shephard bipower variation jump test',
};

export default function RoughVolatilityHurstPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <RoughVolatilityHurstDetector />
    </div>
  );
}

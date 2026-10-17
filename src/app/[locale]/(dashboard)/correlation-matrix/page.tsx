import { Metadata } from 'next';
import { CorrelationMatrixHeatmap } from '@/components/quant/correlation-matrix-heatmap';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Cross-Sectional Rolling Correlation Heatmap',
  description: 'Multi-asset rolling Pearson correlation matrix and HRP cluster contagion monitor',
};

export default function CorrelationMatrixPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <CorrelationMatrixHeatmap />
    </div>
  );
}

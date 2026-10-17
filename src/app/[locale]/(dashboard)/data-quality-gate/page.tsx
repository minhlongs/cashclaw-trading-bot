import { Metadata } from 'next';
import { DataQualityGateInspector } from '@/components/quant/data-quality-gate-inspector';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — OHLCV Data Quality Gate & 9-Validator Fence',
  description: 'Composite 9-dimension OHLCV data quality validator and fail-closed signal guard',
};

export default function DataQualityGatePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <DataQualityGateInspector />
    </div>
  );
}

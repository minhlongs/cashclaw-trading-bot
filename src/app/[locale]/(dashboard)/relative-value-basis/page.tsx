import { Metadata } from 'next';
import { RelativeValueBasisMonitor } from '@/components/quant/relative-value-basis-monitor';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Relative-Value & Perpetual-Spot Funding Basis Monitor',
  description: 'Cross-exchange perpetual-spot basis, annualized funding carry, and OLS z-score spread monitor',
};

export default function RelativeValueBasisPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <RelativeValueBasisMonitor />
    </div>
  );
}

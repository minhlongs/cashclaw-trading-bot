import { Metadata } from 'next';
import { SurvivalGateMonitor } from '@/components/quant/survival-gate-monitor';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Survival Gate & Promotion Lifecycle Monitor',
  description: '8-criterion structural and economic survival gate checklist and promotion state lifecycle',
};

export default function SurvivalGatePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <SurvivalGateMonitor />
    </div>
  );
}

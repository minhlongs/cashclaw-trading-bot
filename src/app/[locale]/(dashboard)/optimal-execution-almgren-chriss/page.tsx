import { Metadata } from 'next';
import { OptimalExecutionAlmgrenChrissCockpit } from '@/components/quant/optimal-execution-almgren-chriss-cockpit';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Almgren-Chriss Optimal Execution Trajectory Cockpit',
  description: 'Mean-variance implementation shortfall frontier and hyperbolic sinh liquidation trajectory',
};

export default function OptimalExecutionAlmgrenChrissPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <OptimalExecutionAlmgrenChrissCockpit />
    </div>
  );
}

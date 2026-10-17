import { Metadata } from 'next';
import { PortfolioCvarStressSimulator } from '@/components/quant/portfolio-cvar-stress-simulator';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Cross-Margin CVaR 99% Tail-Risk Simulator',
  description: 'Expected Shortfall CVaR 99% tail-risk and liquidation cascade stress simulator',
};

export default function PortfolioCvarStressPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <PortfolioCvarStressSimulator />
    </div>
  );
}

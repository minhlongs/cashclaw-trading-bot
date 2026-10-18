import { MartingaleOptimalTransportWorkbench } from '@/components/quant/martingale-optimal-transport-workbench';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata = {
  title: 'Dupire Local Volatility & Martingale Optimal Transport | CashClaw Quant OS',
  description:
    'Gatheral SVI butterfly arbitrage checks, Dupire local volatility surface, and Martingale Optimal Transport bounds for CashClaw OS.',
};

export default function MartingaleOptimalTransportPage() {
  return (
    <main className="w-full py-4 px-2 sm:px-4">
      <MartingaleOptimalTransportWorkbench />
    </main>
  );
}

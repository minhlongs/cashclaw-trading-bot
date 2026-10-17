import { Metadata } from 'next';
import { OrderbookImbalanceLobPredictor } from '@/components/quant/orderbook-imbalance-lob-predictor';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — L3 Orderbook Queue Imbalance & Hawkes Predictor',
  description: 'Hawkes self-exciting arrival intensity kernel and multi-level limit orderbook queue imbalance predictor',
};

export default function OrderbookImbalanceLobPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <OrderbookImbalanceLobPredictor />
    </div>
  );
}

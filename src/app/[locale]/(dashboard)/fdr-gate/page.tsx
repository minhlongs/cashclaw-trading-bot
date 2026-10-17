import { Metadata } from 'next';
import { FdrMultipleTestingGate } from '@/components/quant/fdr-multiple-testing-gate';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Multiple-Testing False Discovery Rate Gate',
  description: 'Benjamini-Hochberg FDR and Deflated Sharpe Ratio pruning gate for quantitative hypotheses',
};

export default function FdrGatePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <FdrMultipleTestingGate />
    </div>
  );
}

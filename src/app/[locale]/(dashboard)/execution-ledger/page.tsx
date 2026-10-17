import { Metadata } from 'next';
import { ExecutionLedgerSimulator } from '@/components/quant/execution-ledger-simulator';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Paper Execution Ledger & Slippage Stress Simulator',
  description: 'Paper-mode execution ledger and multi-tier transaction cost & slippage attribution',
};

export default function ExecutionLedgerPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <ExecutionLedgerSimulator />
    </div>
  );
}

import { Metadata } from 'next';
import { DeliberationTheater } from '@/components/quant/deliberation-theater';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Multi-Agent Deliberation Theater',
  description: 'Bull vs Bear dialectical researcher debate and SHA-256 hash-chained decision ledger',
};

export default function DeliberationPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <DeliberationTheater />
    </div>
  );
}

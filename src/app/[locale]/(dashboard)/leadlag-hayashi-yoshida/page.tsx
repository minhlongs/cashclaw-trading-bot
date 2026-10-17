import { Metadata } from 'next';
import { LeadlagHayashiYoshidaMatrix } from '@/components/quant/leadlag-hayashi-yoshida-matrix';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Hayashi-Yoshida Asynchronous Lead-Lag Matrix',
  description: 'Overlap-weighted asynchronous tick cross-correlation and price discovery lead-lag matrix',
};

export default function LeadlagHayashiYoshidaPage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <LeadlagHayashiYoshidaMatrix />
    </div>
  );
}

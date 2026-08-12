import { Metadata } from 'next';
import BotsListClient from '@/components/bots/bots-list-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Quản lý Bot',
};

export default function BotsPage() {
  return (
    <div className="main-content">
      <BotsListClient />
    </div>
  );
}

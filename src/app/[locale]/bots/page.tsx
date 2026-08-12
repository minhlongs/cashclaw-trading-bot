import { Metadata } from 'next';
import BotsListClient from '@/components/bots/bots-list-client';
import { getBotCards } from '@/forest/dashboard/actions';

export const metadata: Metadata = {
  title: 'CashClaw — Quản lý Bot',
};

export default async function BotsPage() {
  const bots = await getBotCards();
  return (
    <div className="main-content">
      <BotsListClient initialData={bots} />
    </div>
  );
}

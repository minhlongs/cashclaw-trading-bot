import { Metadata } from 'next';
import BotDetailClient from '@/components/bots/bot-detail-client';
import { getBotDetail, getTradeHistory } from '@/forest/dashboard/actions';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `CashClaw — Bot ${id}`,
  };
}

export default async function BotDetailPage({ params }: Props) {
  const { id } = await params;
  const [bot, trades] = await Promise.all([
    getBotDetail(id),
    getTradeHistory(id),
  ]);

  if (!bot) {
    return (
      <div className="main-content">
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <h2 style={{ color: 'var(--text-secondary)' }}>Bot not found</h2>
          <p style={{ color: 'var(--text-tertiary)', marginTop: '8px' }}>
            Không tìm thấy bot / No bot found with ID: {id}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content">
      <BotDetailClient initialData={bot} initialTrades={trades} />
    </div>
  );
}

import { Metadata } from 'next';
import BotWizardClient from '@/components/bots/bot-wizard-client';

export const metadata: Metadata = {
  title: 'CashClaw — Tạo Bot mới',
};

export default function NewBotPage() {
  return (
    <div className="main-content">
      <BotWizardClient />
    </div>
  );
}

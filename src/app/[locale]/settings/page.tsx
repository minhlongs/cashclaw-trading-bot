import { Metadata } from 'next';
import { SettingsClient } from '@/components/settings/settings-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Cài đặt / Settings',
};

export default function SettingsPage() {
  return (
    <div className="main-content">
      <SettingsClient />
    </div>
  );
}

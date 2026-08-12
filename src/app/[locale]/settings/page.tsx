import { Metadata } from 'next';
import SettingsClient from '@/components/settings/settings-client';
import { getSettings } from '@/forest/settings/actions';

export const metadata: Metadata = {
  title: 'CashClaw — Cài đặt / Settings',
};

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <div className="main-content">
      <SettingsClient initialData={settings} />
    </div>
  );
}

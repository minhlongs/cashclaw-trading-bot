import { Metadata } from 'next';
import { MonitoringClient } from '@/components/monitoring/monitoring-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Monitoring',
};

export default function MonitoringPage() {
  return (
    <div className="app-container">
      <MonitoringClient />
    </div>
  );
}

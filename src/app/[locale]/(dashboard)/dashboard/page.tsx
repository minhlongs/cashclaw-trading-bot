import { Metadata } from 'next';
import DashboardClient from '@/components/dashboard/dashboard-client';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="app-container">
      <DashboardClient />
    </div>
  );
}

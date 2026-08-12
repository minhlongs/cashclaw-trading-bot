import { Metadata } from 'next';
import Sidebar from '@/components/layout/sidebar';
import DashboardClient from '@/components/dashboard/dashboard-client';
import { getDashboardData } from '@/forest/dashboard/actions';

export const metadata: Metadata = {
  title: 'CashClaw — Dashboard',
};

export default async function DashboardPage() {
  const serverData = await getDashboardData();
  return (
    <div className="app-container">
      <Sidebar />
      <DashboardClient initialData={serverData} />
    </div>
  );
}

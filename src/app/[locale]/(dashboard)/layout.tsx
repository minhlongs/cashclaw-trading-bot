import Sidebar from '@/components/layout/sidebar';
import MobileNav from '@/components/layout/mobile-nav';

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

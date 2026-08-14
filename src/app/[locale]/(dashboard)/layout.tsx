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
      <main className="main-content" style={{ flex: 1, padding: '1.5rem' }}>
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

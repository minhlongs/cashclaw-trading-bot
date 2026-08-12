import Sidebar from '@/components/layout/sidebar';

export default function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-container">
      <Sidebar />
      {children}
    </div>
  );
}

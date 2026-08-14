import { Suspense } from 'react';
import BotDetailPageClient from './page-client';

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function BotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <Suspense fallback={<div className="main-content"><div className="card" style={{ textAlign: 'center', padding: '60px' }}><p>Loading...</p></div></div>}>
      <BotDetailPageClient params={Promise.resolve(resolvedParams)} />
    </Suspense>
  );
}

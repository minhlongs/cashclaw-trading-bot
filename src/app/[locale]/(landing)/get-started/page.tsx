import { Metadata } from 'next';
import CtaClient from './CtaClient';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'Get Started — CashClaw',
  description: 'Create your first trading bot in minutes.',
};

export default async function CtaPage() {
  return (
    <div className="landing-root">
      <CtaClient />
    </div>
  );
}

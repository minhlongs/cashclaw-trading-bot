import { Metadata } from 'next';
import CtaClient from './CtaClient';

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

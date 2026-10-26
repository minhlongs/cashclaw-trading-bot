import { Metadata } from 'next';
import LandingClient from './LandingClient';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw Quant OS — Open-Core Institutional Algorithmic Trading Framework',
  description:
    'Open-core quantitative trading framework and Cloud SaaS. 28 QuantLib modules, causal Alpha Zoo evaluation, L2 microstructure telemetry, and ADR-001 non-custodial WebCrypto safety.',
  openGraph: {
    title: 'CashClaw Quant OS — Open-Core Institutional Algorithmic Trading',
    description:
      '28 QuantLib modules, Walk-Forward & FDR validation, L2 microstructure telemetry, and non-custodial WebCrypto enclave.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CashClaw Quant OS — Institutional Open-Core Quant Framework',
    description:
      'Causal alpha research, L2 microstructure telemetry, and 28 verified QuantLib modules.',
  },
};

export default async function LandingPage() {
  return (
    <div className="landing-root">
      <LandingClient />
    </div>
  );
}

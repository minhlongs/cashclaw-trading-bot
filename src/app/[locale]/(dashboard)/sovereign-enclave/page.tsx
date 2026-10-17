import { Metadata } from 'next';
import { SovereignEnclaveAttestation } from '@/components/quant/sovereign-enclave-attestation';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Sovereign Enclave Cryptographic Attestation',
  description: 'WebCrypto SHA-256 hash-chained audit ledger and ADR-001 secret-stripping verifier',
};

export default function SovereignEnclavePage() {
  return (
    <div className="py-6 px-4 md:px-8 max-w-7xl mx-auto w-full">
      <SovereignEnclaveAttestation />
    </div>
  );
}

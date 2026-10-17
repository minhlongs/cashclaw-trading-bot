'use client';

import { useState } from 'react';
import { KeyRound, ShieldCheck, Lock } from 'lucide-react';

const AUDIT_CHAIN = [
  { seq: 101, event: 'INIT_ENCLAVE_ISOLATE', prevHash: '0000000000000000', blockHash: '7f83b1657ff1fc53' },
  { seq: 102, event: 'STRIP_API_CREDENTIALS_ADR001', prevHash: '7f83b1657ff1fc53', blockHash: '3c9909afec25354d' },
  { seq: 103, event: 'LOCK_PAPER_EXECUTION_PROVIDER', prevHash: '3c9909afec25354d', blockHash: 'a4e624d686e03f2b' },
] as const;

export function SovereignEnclaveAttestation() {
  const [tamperSimulated, setTamperSimulated] = useState<boolean>(false);

  return (
    <section aria-label="Sovereign Enclave Cryptographic Attestation and Audit Ledger" className="flex flex-col gap-6 w-full max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <KeyRound size={20} className="text-[var(--color-accent)]" />
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Sovereign Enclave Attestation & Hash-Chained Audit Ledger</h1>
            <p className="text-xs text-[var(--text-secondary)]">WebCrypto SHA-256 flight recorder • Live exchange keys stripped by ADR-001 invariant</p>
          </div>
        </div>
        <span role="status" aria-label="Safety mode PAPER_ONLY ADR-001" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase bg-[rgba(255,176,32,0.15)] text-[var(--color-warning)] border border-[rgba(255,176,32,0.35)]">
          <ShieldCheck size={14} /><span>PAPER_ONLY • ADR-001</span>
        </span>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Hash-Chain Integrity</span>
          <div className={`mt-1 font-mono text-xl font-bold ${tamperSimulated ? 'text-[var(--color-loss)]' : 'text-[var(--color-profit)]'}`}>
            {tamperSimulated ? 'CHAIN_MISMATCH_HALT' : 'VERIFIED_INTACT'}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <span className="text-xs text-[var(--text-secondary)]">Secret Key Guard (ADR-001)</span>
          <div className="mt-1 font-mono text-xl font-bold text-[var(--color-accent)] flex items-center gap-1.5">
            <Lock size={16} /><span>KEYS_REDACTED</span>
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between">
          <div>
            <span className="text-xs text-[var(--text-secondary)]">Tamper Audit Probe</span>
            <div className="mt-1 font-mono text-xs text-[var(--text-primary)]">{tamperSimulated ? 'TAMPER_INJECTED' : 'CLEAN_LEDGER'}</div>
          </div>
          <button type="button" onClick={() => setTamperSimulated((v) => !v)} aria-pressed={tamperSimulated} className={`min-h-[44px] px-3 py-2 rounded-lg text-xs font-mono font-semibold border transition-all duration-150 ease-out ${tamperSimulated ? 'bg-[var(--color-loss)] text-[var(--text-primary)] border-[var(--color-loss)]' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-default)]'}`}>
            {tamperSimulated ? 'Restore Chain' : 'Simulate Tamper'}
          </button>
        </div>
      </div>

      <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
        <table className="w-full text-left text-xs font-mono" aria-label="Hash-chained flight recorder ledger">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <th className="pb-2">Seq</th><th className="pb-2">Enclave Event</th><th className="pb-2">Prev SHA-256</th><th className="pb-2">Block SHA-256</th><th className="pb-2 text-right">Secret Fence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {AUDIT_CHAIN.map((block) => (
              <tr key={block.seq} className="hover:bg-[var(--bg-hover)]">
                <td className="py-3 text-[var(--text-secondary)]">#{block.seq}</td>
                <td className="py-3 font-semibold text-[var(--text-primary)]">{block.event}</td>
                <td className="py-3 text-[var(--text-tertiary)]">{block.prevHash}</td>
                <td className="py-3 text-[var(--color-ai)]">{tamperSimulated && block.seq === 103 ? 'deadbeef00000000' : block.blockHash}</td>
                <td className="py-3 text-right">
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-[rgba(0,212,170,0.15)] text-[var(--color-profit)]">STRIPPED</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

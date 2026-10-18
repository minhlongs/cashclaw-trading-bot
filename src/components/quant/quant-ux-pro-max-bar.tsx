'use client';

import { useState } from 'react';
import { Check, Copy, Pause, Play, Shield } from 'lucide-react';

export interface QuantUxProMaxBarProps {
  readonly screenId: string;
  readonly telemetryPayload: unknown;
}

export function QuantUxProMaxBar({ screenId, telemetryPayload }: QuantUxProMaxBarProps) {
  const [copied, setCopied] = useState(false);
  const [frozenPulse, setFrozenPulse] = useState(false);

  const handleCopyJson = () => {
    const serialized = JSON.stringify({ screenId, paperOnly: true, data: telemetryPayload }, null, 2);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(serialized).catch(() => undefined);
    }
    setCopied(true);
  };

  return (
    <div
      role="toolbar"
      aria-label="ak-ui-ux-pro-max Accessibility and Telemetry Controls"
      className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] quant-tabular"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-[rgba(0,212,170,0.12)] text-[var(--color-accent)] border border-[rgba(0,212,170,0.3)]">
          <Shield size={13} />
          WCAG AAA 7:1 • TABULAR-NUMS
        </span>
        <span
          aria-live="polite"
          className="text-xs font-mono text-[var(--text-secondary)]"
        >
          {frozenPulse ? 'STREAM_FROZEN (Reduced Motion)' : 'LIVE_PAPER_PULSE_ACTIVE'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFrozenPulse((prev) => !prev)}
          aria-pressed={frozenPulse}
          className="min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-[#00D4AA]"
        >
          {frozenPulse ? <Play size={13} /> : <Pause size={13} />}
          {frozenPulse ? 'Resume Live Pulse' : 'Freeze Live Pulse'}
        </button>

        <button
          type="button"
          onClick={handleCopyJson}
          className="min-h-[44px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border border-[var(--color-accent)] bg-[rgba(0,212,170,0.12)] text-[var(--color-accent)] inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-[#00D4AA]"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span aria-live="polite">{copied ? 'Copied Telemetry JSON' : 'Export JSON'}</span>
        </button>
      </div>
    </div>
  );
}

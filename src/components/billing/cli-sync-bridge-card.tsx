'use client';

import React, { useState } from 'react';

export interface CliSyncBridgeProps {
  workspaceId: string;
}

export function CliSyncBridgeCard({ workspaceId }: CliSyncBridgeProps) {
  const [copied, setCopied] = useState(false);
  const syncCommand = `npx cashclaw export-sync --workspace=${workspaceId} --target=cloud`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(syncCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold">1-Click Local-to-Cloud Sync Bridge</h3>
          <p className="meta text-xs">
            Export SHA-256 signed paper bot configurations from local CLI directly to your Cloud SaaS isolate
          </p>
        </div>
      </div>

      <div className="bg-surface-raised p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
        <code className="text-xs font-mono text-primary truncate">{syncCommand}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition"
        >
          {copied ? 'Copied!' : 'Copy Command'}
        </button>
      </div>

      <p className="meta text-xs mt-3">
        Preserves ADR-001 paper-only invariants. Cloud import endpoint: <code>/api/ee/sync</code>
      </p>
    </div>
  );
}

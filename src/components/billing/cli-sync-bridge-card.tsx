'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';

export interface CliSyncBridgeProps {
  workspaceId: string;
}

export function CliSyncBridgeCard({ workspaceId }: CliSyncBridgeProps) {
  const t = useTranslations('billing.sync');
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
          <h3 className="text-base font-semibold">{t('title')}</h3>
          <p className="meta text-xs">{t('subtitle')}</p>
        </div>
      </div>

      <div className="bg-surface-raised p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3">
        <code className="text-xs font-mono text-primary truncate">{syncCommand}</code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/90 transition"
        >
          {copied ? t('copied') : t('copyCommand')}
        </button>
      </div>

      <p className="meta text-xs mt-3">
        {t('footerPrefix')} <code>/api/ee/sync</code>
      </p>
    </div>
  );
}

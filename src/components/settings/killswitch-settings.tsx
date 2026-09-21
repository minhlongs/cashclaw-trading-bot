'use client';

import { Power, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface KillswitchSettingsProps {
  enabled: boolean;
  onHalt: () => Promise<void> | void;
  onResume: () => Promise<void> | void;
  isSaving?: boolean;
}

export function KillswitchSettings({
  enabled,
  onHalt,
  onResume,
  isSaving = false,
}: KillswitchSettingsProps) {
  const t = useTranslations('settings');

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Power size={16} />
          <span>{t('killswitch.title')}</span>
        </div>
        <span className={`badge ${!enabled ? 'badge-error' : 'badge-neutral'}`}>
          {!enabled ? t('killswitch.halted') : t('killswitch.active')}
        </span>
      </div>
      <div>
        <p className="killswitch-desc">{t('killswitch.description')}</p>
        <div className="killswitch-actions">
          <button
            className="btn btn-danger btn-sm"
            onClick={onHalt}
            disabled={isSaving || !enabled}
            aria-label={t('killswitch.haltButton')}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}{' '}
            {t('killswitch.haltButton')}
          </button>
          <button
            className="btn btn-primary"
            disabled={isSaving || enabled}
            onClick={onResume}
            aria-label={t('killswitch.resumeButton')}
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}{' '}
            {t('killswitch.resumeButton')}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

interface BotDetailConfigProps {
  config: Record<string, number>;
  botId?: string;
  onConfigSaved?: (newConfig: Record<string, number>) => void;
}

interface SaveStatus {
  type: 'success' | 'error';
  message: string;
}

export function BotDetailConfig({ config, botId, onConfigSaved }: BotDetailConfigProps) {
  const t = useTranslations('botDetail');
  const [formValues, setFormValues] = useState<Record<string, number>>(config);
  const [prevConfig, setPrevConfig] = useState(config);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus | null>(null);

  if (config !== prevConfig) {
    setPrevConfig(config);
    setFormValues(config);
  }

  const handleInputChange = (key: string, value: string) => {
    const num = parseFloat(value);
    setFormValues((prev) => ({
      ...prev,
      [key]: Number.isFinite(num) ? num : 0,
    }));
  };

  const handleSave = async () => {
    for (const [, val] of Object.entries(formValues)) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
        setStatus({ type: 'error', message: t('invalidConfig') });
        return;
      }
    }
    setIsSaving(true);
    setStatus(null);
    try {
      if (!botId) {
        onConfigSaved?.(formValues);
        setStatus({ type: 'success', message: t('configSaved') });
        return;
      }
      const res = await fetch(`/api/bots/${botId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ config: formValues }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        data?: { config?: Record<string, number> };
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update configuration');
      }
      setStatus({ type: 'success', message: t('configSaved') });
      const savedConfig = data.data?.config ?? formValues;
      onConfigSaved?.(savedConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ type: 'error', message: t('configSaveFailed', { error: msg }) });
    } finally {
      setIsSaving(false);
    }
  };

  const configEntries = Object.entries(formValues);

  return (
    <div className="config-grid">
      {status && (
        <div
          className={`config-full badge ${status.type === 'success' ? 'badge-success' : 'badge-error'} flex items-center justify-between gap-2 p-3 text-sm`}
          role="alert"
        >
          <span>{status.message}</span>
          <button
            type="button"
            className="text-secondary hover:text-primary ml-2 text-xs"
            onClick={() => setStatus(null)}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}
      {configEntries.map(([key, value]) => (
        <div key={key}>
          <label className="form-label" htmlFor={`config-${key}`}>{key}</label>
          <input
            id={`config-${key}`}
            type="number"
            className="form-input"
            value={value}
            onChange={(e) => handleInputChange(key, e.target.value)}
            disabled={isSaving}
            step="0.1"
          />
        </div>
      ))}
      <div className="config-full">
        <button
          type="button"
          className="btn btn-primary flex items-center gap-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving && <Loader2 size={16} className="animate-spin" />}
          {isSaving ? t('saving') : t('saveConfig')}
        </button>
      </div>
    </div>
  );
}

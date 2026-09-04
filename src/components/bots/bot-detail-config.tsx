'use client';

import { useTranslations } from 'next-intl';

interface BotDetailConfigProps {
  config: Record<string, number>;
}

export function BotDetailConfig({ config }: BotDetailConfigProps) {
  const t = useTranslations('botDetail');
  const configEntries = Object.entries(config);

  return (
    <div className="config-grid">
      {configEntries.map(([key, value]) => (
        <div key={key}>
          <label className="form-label">{key}</label>
          <input
            type="number"
            className="form-input"
            defaultValue={value}
            step="0.1"
          />
        </div>
      ))}
      <div className="config-full">
        <button className="btn btn-primary">{t('saveConfig')}</button>
      </div>
    </div>
  );
}

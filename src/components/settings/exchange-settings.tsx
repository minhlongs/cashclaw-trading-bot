'use client';

import { useExchangeSettingsState } from './exchange-settings-state';
import { ExchangeSettingsCard } from './exchange-settings-forms';
import type { SettingsData } from '@/forest/settings/actions';

interface ExchangeSettingsProps {
  exchanges: SettingsData['exchanges'];
  onSave: (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => Promise<void>;
}

export function ExchangeSettings({ exchanges, onSave }: ExchangeSettingsProps) {
  const state = useExchangeSettingsState(exchanges);
  const exchangeEntries = Object.entries(exchanges) as [
    string,
    SettingsData['exchanges']['binance']
  ][];

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="font-600 text-cap">Exchange API Keys</span>
        </div>
      </div>
      <div>
        {exchangeEntries.map(([name, config]) => (
          <ExchangeSettingsCard
            key={name}
            name={name}
            config={config}
            state={state}
            onSave={onSave}
          />
        ))}
      </div>
    </div>
  );
}

export type { ExchangeSettingsProps };
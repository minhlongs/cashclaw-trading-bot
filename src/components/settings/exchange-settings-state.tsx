'use client';

import { useState, useRef, useEffect } from 'react';
import type { SettingsData } from '@/forest/settings/actions';

export function useExchangeSettingsState(
  exchanges: SettingsData['exchanges']
) {
  const [editing, setEditing] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnet, setTestnet] = useState(true);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleEdit = (exchange: string) => {
    const config = exchanges[exchange as keyof typeof exchanges];
    setEditing(exchange);
    setApiKey(config.apiKey);
    setApiSecret(config.apiSecret);
    setTestnet(config.testnet);
  };

  const handleSave = async (
    onSave: (exchange: string, apiKey: string, apiSecret: string, testnet: boolean) => Promise<void>
  ) => {
    if (!editing) return;
    setSaving(true);
    try {
      await onSave(editing, apiKey, apiSecret, testnet);
      if (mountedRef.current) setEditing(null);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return {
    editing,
    apiKey,
    apiSecret,
    testnet,
    saving,
    mountedRef,
    setApiKey,
    setApiSecret,
    setTestnet,
    setEditing,
    handleEdit,
    handleSave,
  };
}

export type { ExchangeSettingsProps } from './exchange-settings';
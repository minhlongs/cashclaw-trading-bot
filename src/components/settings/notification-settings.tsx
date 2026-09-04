'use client';

import { useState, useRef, useEffect } from 'react';
import { Zap, Loader2 } from 'lucide-react';

interface NotificationSettingsProps {
  telegram: {
    botToken: string;
    chatId: string;
  };
  onSave: (botToken: string, chatId: string) => Promise<void>;
}

export function NotificationSettings({ telegram, onSave }: NotificationSettingsProps) {
  const [botToken, setBotToken] = useState(telegram.botToken);
  const [chatId, setChatId] = useState(telegram.chatId);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(botToken, chatId);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <Zap size={16} />
          <span>Telegram Notifications</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="form-label">
            Bot Token
          </label>
          <input
            type="password"
            placeholder="@Sophia_Bbot token"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">
            Chat ID
          </label>
          <input
            type="text"
            placeholder="Telegram chat ID"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="form-input"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || !botToken || !chatId}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Telegram Config'}
        </button>
      </div>
    </div>
  );
}

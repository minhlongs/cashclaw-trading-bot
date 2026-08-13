'use client';

import { useState } from 'react';
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(botToken, chatId);
    } finally {
      setSaving(false);
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Bot Token
          </label>
          <input
            type="password"
            placeholder="@Sophia_Bbot token"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Chat ID
          </label>
          <input
            type="text"
            placeholder="Telegram chat ID"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <button
          className="btn btn-primary"
          style={{ padding: '8px' }}
          onClick={handleSave}
          disabled={saving || !botToken || !chatId}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Telegram Config'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';

export default function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, passcode }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string; user?: { id: string; email: string } };

      if (!res.ok || !data.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      // Login successful — redirect to dashboard (use current locale)
      router.push(`/${locale}/dashboard`);
    } catch {
      setError('Network error — please try again');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded text-sm bg-loss">
          {error}
        </div>
      )}

      <div className="form-group">
        <label className="form-label">
          Email / Email
        </label>
        <input
          type="email"
          className="form-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </div>

      <div className="form-group">
        <label className="form-label">
          Mật khẩu / Passcode
        </label>
        <input
          type="password"
          className="form-input"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="••••••••"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary w-full" disabled={loading}>
        {loading ? <span className="text-muted">{t('common.loading')}</span> : 'Đăng nhập / Login'}
      </button>
    </form>
  );
}

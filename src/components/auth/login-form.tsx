'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function LoginForm() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: wire auth
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          Mật khẩu / Password
        </label>
        <input
          type="password"
          className="form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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

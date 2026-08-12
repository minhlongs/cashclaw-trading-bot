import { Metadata } from 'next';
import LoginForm from '@/components/auth/login-form';

export function generateStaticParams() {
  return [{ locale: 'vi' }, { locale: 'en' }];
}

export const metadata: Metadata = {
  title: 'CashClaw — Đăng nhập',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: 'var(--color-profit)' }}
          >
            CashClaw
          </h1>
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
            AI Trading Bot Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Đăng nhập / Login</h2>
          </div>

          <LoginForm />
        </div>

        <p className="text-center mt-6" style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
          CashClaw Algo Trader · Internal Tool
        </p>
      </div>
    </div>
  );
}

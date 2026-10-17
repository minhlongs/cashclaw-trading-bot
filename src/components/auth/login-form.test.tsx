import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, within, waitFor, cleanup, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'common.loading' ? 'Loading...' : key),
  useLocale: () => 'vi',
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import LoginForm from '@/components/auth/login-form';

let renderResult: RenderResult;

function setup(ui?: ReactElement) {
  renderResult = render(ui ?? <LoginForm />);
  return renderResult;
}

function getFormEl(): HTMLElement {
  return renderResult.container.querySelector('form')!;
}

function w() {
  return within(getFormEl());
}

function getEmailInput() {
  return w().getByPlaceholderText('you@example.com');
}
function getPasscodeInput() {
  return w().getByPlaceholderText('••••••••');
}
function getSubmitButton() {
  return w().getByRole('button', { name: /đăng nhập \/ login/i });
}

describe('LoginForm — Inputs, Auth Responses & Redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders email and passcode inputs with labels', () => {
    setup();
    const form = w();

    const emailInput = form.getByPlaceholderText('you@example.com');
    const passcodeInput = form.getByPlaceholderText('••••••••');

    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('type', 'email');
    expect(passcodeInput).toBeInTheDocument();
    expect(passcodeInput).toHaveAttribute('type', 'password');

    expect(form.getByText(/email \/ email/i)).toBeInTheDocument();
    expect(form.getByText(/mật khẩu \/ passcode/i)).toBeInTheDocument();
  });

  it('updates email and passcode state on input change', async () => {
    const user = userEvent.setup();
    setup();

    const emailInput = getEmailInput();
    const passcodeInput = getPasscodeInput();

    await user.type(emailInput, 'test@example.com');
    await user.type(passcodeInput, 'secret123');

    expect(emailInput).toHaveValue('test@example.com');
    expect(passcodeInput).toHaveValue('secret123');
  });

  it('shows error message on failed login (non-ok HTTP)', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: 'Invalid credentials' }),
    });

    setup();
    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasscodeInput(), 'wrong');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('shows error when response ok but data.ok is false', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: 'Account locked' }),
    });

    setup();
    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasscodeInput(), 'pass');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('Account locked')).toBeInTheDocument();
    });
  });

  it('falls back to "Login failed" when server omits error message', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false }),
    });

    setup();
    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasscodeInput(), 'pass');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeInTheDocument();
    });
  });

  it('shows network error on fetch rejection', async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    setup();
    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasscodeInput(), 'pass');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('Network error — please try again')).toBeInTheDocument();
    });
  });

  it('redirects to /vi/dashboard on successful login', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { id: '1', email: 'user@example.com' } }),
    });

    setup();
    await user.type(getEmailInput(), 'user@example.com');
    await user.type(getPasscodeInput(), 'correct');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/vi/dashboard');
    });
  });

  it('sends correct payload to /api/auth/login', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { id: '1', email: 'a@b.com' } }),
    });

    setup();
    await user.type(getEmailInput(), 'a@b.com');
    await user.type(getPasscodeInput(), 'pw123');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', passcode: 'pw123' }),
      });
    });
  });
});

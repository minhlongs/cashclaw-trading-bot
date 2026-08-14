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

describe('LoginForm', () => {
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
      json: async () => ({
        ok: true,
        user: { id: '1', email: 'user@example.com' },
      }),
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

  it('disables submit button while loading', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    setup();

    const button = getSubmitButton();
    expect(button).not.toBeDisabled();

    await user.type(getEmailInput(), 'a@b.com');
    await user.type(getPasscodeInput(), 'pw');
    await user.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Resolve with a failure: the success path deliberately keeps loading=true
    // while router.push navigates away, so only the error path re-enables.
    resolveFetch({ ok: false, json: async () => ({ ok: false, error: 'Nope' }) });

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('shows "Loading..." text while submitting', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    setup();

    await user.type(getEmailInput(), 'a@b.com');
    await user.type(getPasscodeInput(), 'pw');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    resolveFetch({ ok: false, json: async () => ({ ok: false, error: 'Nope' }) });

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(w().getByText(/đăng nhập \/ login/i)).toBeInTheDocument();
    });
  });

  it('prevents default form submission', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, user: { id: '1', email: 'a@b.com' } }),
    });

    setup();
    const form = getFormEl();
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

    form.dispatchEvent(submitEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(submitEvent.defaultPrevented).toBe(true);

    // Let the submit handler settle so no state update escapes the test.
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  it('clears previous error before showing result of new submission', async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: 'First error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

    setup();

    await user.type(getEmailInput(), 'a@b.com');
    await user.type(getPasscodeInput(), 'pw');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument();
    });

    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument();
    });
  });
});

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

describe('LoginForm — Loading State, Submission Event & Error Clearing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
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

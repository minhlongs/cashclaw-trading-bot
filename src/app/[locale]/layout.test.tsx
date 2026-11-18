import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
});
const mockSetRequestLocale = vi.fn<(locale: string) => void>();
const mockProviderSpy = vi.fn<(props: { locale?: string; messages?: unknown }) => void>();
const mockGetMessages = vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(
  async () => ({ nav: { home: 'Home' } }),
);

vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

vi.mock('next-intl', () => ({
  NextIntlClientProvider: (props: { locale?: string; messages?: unknown; children: unknown }) => {
    mockProviderSpy({ locale: props.locale, messages: props.messages });
    return props.children;
  },
}));

vi.mock('next-intl/server', () => ({
  getMessages: (...args: unknown[]) => mockGetMessages(...args),
  setRequestLocale: (locale: string) => mockSetRequestLocale(locale),
  getRequestConfig: <T,>(fn: T) => fn,
}));

import * as LocaleLayoutModule from './layout';
import i18nRequestConfig from '@/i18n/request';

describe('P1-01 [locale] dynamic segment & i18n request hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports static params restricted strictly to supported locales', () => {
    expect(LocaleLayoutModule.generateStaticParams()).toEqual([{ locale: 'vi' }, { locale: 'en' }]);
  });

  it.each(['public', 'favicon.ico', 'faviconXico', 'fr', '_next'])(
    'calls notFound() instead of returning null for invalid locale segment "%s"',
    async (badLocale) => {
      await expect(
        LocaleLayoutModule.default({
          children: null,
          params: Promise.resolve({ locale: badLocale }),
        }),
      ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
      expect(mockNotFound).toHaveBeenCalledTimes(1);
      expect(mockGetMessages).not.toHaveBeenCalled();
    },
  );

  it.each(['vi', 'en'])(
    'renders valid locale "%s", calls setRequestLocale, and passes explicit locale to NextIntlClientProvider',
    async (goodLocale) => {
      const tree = (await LocaleLayoutModule.default({
        children: 'ok-child',
        params: Promise.resolve({ locale: goodLocale }),
      })) as {
        props: {
          lang: string;
          children: {
            props: {
              children: {
                type: (props: { locale?: string; messages?: unknown; children: unknown }) => unknown;
                props: { locale?: string; messages?: unknown; children: unknown };
              };
            };
          };
        };
      };
      expect(tree.props.lang).toBe(goodLocale);
      expect(mockNotFound).not.toHaveBeenCalled();
      expect(mockSetRequestLocale).toHaveBeenCalledWith(goodLocale);
      expect(mockGetMessages).toHaveBeenCalledWith({ locale: goodLocale });
      const providerElement = tree.props.children.props.children;
      providerElement.type(providerElement.props);
      expect(mockProviderSpy).toHaveBeenCalledWith({
        locale: goodLocale,
        messages: { nav: { home: 'Home' } },
      });
    },
  );

  it.each(['public', 'favicon.ico', 'fr'])(
    'i18n/request.ts calls notFound() rather than silently falling back to defaultLocale for "%s"',
    async (badLocale) => {
      const resolver = i18nRequestConfig as unknown as (ctx: {
        locale?: string;
        requestLocale: Promise<string | undefined>;
      }) => Promise<{ locale: string; messages: unknown }>;

      await expect(
        resolver({ locale: badLocale, requestLocale: Promise.resolve(badLocale) }),
      ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');

      await expect(
        resolver({ locale: undefined, requestLocale: Promise.resolve(badLocale) }),
      ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    },
  );

  it('i18n/request.ts resolves valid locales and root undefined requestLocale cleanly', async () => {
    const resolver = i18nRequestConfig as unknown as (ctx: {
      locale?: string;
      requestLocale: Promise<string | undefined>;
    }) => Promise<{ locale: string; messages: unknown }>;

    const enCfg = await resolver({ locale: 'en', requestLocale: Promise.resolve('en') });
    expect(enCfg.locale).toBe('en');

    const rootCfg = await resolver({ locale: undefined, requestLocale: Promise.resolve(undefined) });
    expect(rootCfg.locale).toBe('vi');
  });
});

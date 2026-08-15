// Registers jest-dom matchers (toBeInTheDocument, toBeDisabled, ...) for jsdom tests
// and tears down rendered React trees between cases so queries never see stale DOM.
// Also provides a global next-intl mock so components using useTranslations render
// real bilingual strings during tests without per-file mocks.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

const messagesByLocale: Record<string, Record<string, unknown>> = {};

function serialize(node: unknown): string | undefined {
  if (Array.isArray(node)) return JSON.stringify(node);
  if (node && typeof node === 'object') return JSON.stringify(node);
  if (node !== undefined && node !== null) return String(node);
  return undefined;
}

function resolveMessage(ns: string, key: string, locale: string): string {
  const flatKey = `${ns ? ns + '.' : ''}${key}`;
  const map = messagesByLocale[locale] ?? messagesByLocale['vi'] ?? {};
  const direct = serialize(flatKey in map ? map[flatKey] : undefined);
  if (direct !== undefined) return direct;
  const parts = flatKey.split('.');
  let node: unknown = map;
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return flatKey;
    }
  }
  return serialize(node) ?? flatKey;
}

async function initMessageMaps() {
  try {
    const [viModule, enModule] = await Promise.all([
      import('./messages/vi.json').catch(() => ({ default: {} })),
      import('./messages/en.json').catch(() => ({ default: {} })),
    ]);
    messagesByLocale['vi'] = viModule.default as Record<string, unknown>;
    messagesByLocale['en'] = enModule.default as Record<string, unknown>;
  } catch {
    // ignore bundle issues; tests fall back to key return.
  }
}
void initMessageMaps();

const mockLocale = { current: 'vi' } as { current: string };
const translationLocale = 'en';

function createTranslator(ns?: string) {
  const base = (key: string, ...rest: unknown[]) => {
    if (rest.length) {
      const param = typeof rest[0] === 'object' && rest[0] !== null ? (rest[0] as Record<string, string>) : {};
      const resolved = resolveMessage(ns ?? '', key, translationLocale);
      return resolved.replace(/\{(\w+)\}/g, (_match: string, name: string) => param[name] ?? `{${name}}`);
    }
    return resolveMessage(ns ?? '', key, translationLocale);
  };
  const raw = (key: string) => {
    const value = base(key);
    if (value === key) return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  };
  const fn = base as ((key: string, ...args: unknown[]) => string) & { raw: (key: string) => unknown };
  fn.raw = raw;
  return fn;
}

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale.current,
  useTranslations: (...args: unknown[]) => createTranslator(typeof args[0] === 'string' ? (args[0] as string) : undefined),
  getRequestConfig: async () => ({ locale: mockLocale.current, messages: {} }),
}));

export { mockLocale };
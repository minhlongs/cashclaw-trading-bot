import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const candidate = locale ?? (await requestLocale);
  if (candidate !== undefined && !locales.includes(candidate as Locale)) {
    notFound();
  }
  const validLocale: Locale = candidate ? (candidate as Locale) : defaultLocale;

  return {
    locale: validLocale,
    messages: (await import(`@/messages/${validLocale}.json`)).default,
  };
});

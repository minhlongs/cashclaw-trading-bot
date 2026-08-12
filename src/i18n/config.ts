import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';

const locales = ['vi', 'en'] as const;

export default getRequestConfig(async (params) => {
  const { locale } = params;

  if (!locales.includes(locale as 'vi' | 'en')) {
    notFound();
  }

  const validLocale = locale as 'vi' | 'en';

  return {
    locale: validLocale,
    messages: (await import(`@/messages/${validLocale}.json`)).default,
  };
});

import {getRequestConfig} from 'next-intl/server';
import {locales, defaultLocale} from './config';

export default getRequestConfig(async ({locale}) => {
  // For static export, locale is resolved from params (not headers)
  const validLocale = locales.includes(locale as 'vi' | 'en')
    ? (locale as 'vi' | 'en')
    : defaultLocale;

  return {
    locale: validLocale,
    messages: (await import(`@/messages/${validLocale}.json`)).default
  };
});

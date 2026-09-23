import { notFound } from 'next/navigation';
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Pages outside the [locale] segment (e.g. the root "/" redirect page) have
  // no segment locale — fall back to the default (English).
  if (!locale) locale = routing.defaultLocale;
  if (!hasLocale(routing.locales, locale)) notFound();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

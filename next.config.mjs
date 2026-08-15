import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['ccxt'],
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);

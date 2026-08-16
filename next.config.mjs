import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['ccxt'],
  env: {
    GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA || '',
    BUILD_TIMESTAMP: process.env.BUILD_TIMESTAMP || '',
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);

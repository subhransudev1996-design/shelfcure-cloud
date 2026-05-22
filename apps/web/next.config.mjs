/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@shelfcure/ui',
    '@shelfcure/core',
    '@shelfcure/api-client',
    '@shelfcure/db-types',
    '@shelfcure/hotkeys',
    '@shelfcure/i18n',
  ],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;

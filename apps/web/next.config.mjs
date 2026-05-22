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
  typedRoutes: true,
};

export default nextConfig;

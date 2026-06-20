/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shelfcure/core', '@shelfcure/api-client', '@shelfcure/db-types'],
  typedRoutes: true,
};

export default nextConfig;

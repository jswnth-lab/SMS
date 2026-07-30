/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@monorepo/core', '@monorepo/api', '@monorepo/db'],
  experimental: {
    useTypeScriptCli: true,
  },
};

module.exports = nextConfig;

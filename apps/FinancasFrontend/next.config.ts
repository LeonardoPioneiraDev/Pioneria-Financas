import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@pioneira/shared'],
  // 'standalone' gera um build minimal (.next/standalone/server.js) que copia só o necessário —
  // imagem Docker fica ~150MB em vez de 1.5GB. Tem que estar setado antes do `next build`.
  output: 'standalone',
  // Necessário para Docker: o standalone procura node_modules na raiz do monorepo.
  outputFileTracingRoot: process.cwd().includes('apps/FinancasFrontend')
    ? `${process.cwd()}/../../`
    : process.cwd(),
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;

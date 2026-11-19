import { apiRewrites, securityHeaders } from './lib/deploy-config.mjs';

const rewrites = apiRewrites(process.env);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  // Servicio único: con API_INTERNAL_URL (al compilar) /api/* se reenvía a la API por loopback
  // y el plazo del proxy sube a 60 s (el de 30 s cortaría un cierre de reto o una exportación).
  ...(rewrites.length ? { experimental: { proxyTimeout: 60_000 } } : {}),
  async rewrites() {
    return rewrites;
  },
  async headers() {
    return securityHeaders();
  },
};

export default nextConfig;

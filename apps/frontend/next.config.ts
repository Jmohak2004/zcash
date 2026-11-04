import type { NextConfig } from 'next';
const config: NextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.BACKEND_URL || 'http://127.0.0.1:3001'}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }, { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }] }];
  },
};
export default config;

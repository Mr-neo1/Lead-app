/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['nedb-promises'],
    // Optimize imports for better tree-shaking and faster builds
    optimizePackageImports: ['recharts', '@uiw/react-md-editor', 'xlsx', 'libphonenumber-js'],
  },

  // Enable Partial Prerendering (14.2+) for faster page loads
  // ppr: 'incremental',
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          },
        ],
      },
    ];
  },

  // Compress responses
  compress: true,
};

module.exports = nextConfig;

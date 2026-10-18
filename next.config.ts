import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public SDK and legacy Pong packages provide precompiled JavaScript and public exports.
  // Keep the normal Turbopack path; the workaround below is Webpack-only.
  turbopack: {},
  webpack(config) {
    // npm uses absolute directory junctions for file: packages on Windows.
    // The vendored Webpack snapshotter crashes on these links (#21636).
    // Only the local build cache is disabled; runtime/Cloudflare caching is unchanged.
    if (process.platform === 'win32') config.cache = false
    return config
  },
  images: {
    // Workers serves original images; the standard Next/Vercel build keeps its optimizer.
    unoptimized: process.env.CHIBASKO_CLOUDFLARE === '1',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.chibaskogames.fr',
        pathname: '/avatars/**',
      },
      {
        protocol: 'https',
        hostname: 'assets.chibaskogames.fr',
        pathname: '/game-thumbnails/**',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;

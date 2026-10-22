import type { NextConfig } from "next";
import {readFileSync} from 'node:fs'

let catalogueImages='{}'
try{catalogueImages=readFileSync('.distribution/catalogue-images.json','utf8')}catch{}

const nextConfig: NextConfig = {
  env:{CHIBASKO_CATALOGUE_IMAGES:catalogueImages},
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  },
  images: {
    // Workers uses static catalogue derivatives with original-image fallback.
    // The standard Next.js build retains its image optimizer.
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

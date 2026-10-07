import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Workers serves original images; the standard Next/Vercel build keeps its optimizer.
    unoptimized: process.env.CHIBASKO_CLOUDFLARE === '1',
    remotePatterns: [
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

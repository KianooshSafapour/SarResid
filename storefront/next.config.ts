import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: false,
  typescript: { ignoreBuildErrors: false },
  // عکس‌های کالا از دامنه‌های مختلف می‌آیند (ProductImage.url) — با <img> ساده لود می‌شوند
  images: { unoptimized: true },
  
}

export default nextConfig

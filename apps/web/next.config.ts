import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@videon-v3/contracts', '@msqdx/ui', '@msqdx/ui-tokens'],
}

export default nextConfig

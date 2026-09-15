import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/mcp': ['./registry/**/*'],
  },
}

export default nextConfig

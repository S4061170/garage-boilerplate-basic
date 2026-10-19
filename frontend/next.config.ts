import type { NextConfig } from 'next'
import path from 'node:path'

const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Deny framing (clickjacking protection)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Reduce referrer information leakage
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features not used by this app
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
]

const nextConfig: NextConfig = {
  // App Hosting runs the traced Next.js server, retaining hoisted workspace dependencies.
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..'),
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig

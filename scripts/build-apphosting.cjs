'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const nextCli = require.resolve('next/dist/bin/next', {
  paths: [path.join(root, 'frontend')],
})
const result = spawnSync(process.execPath, [nextCli, 'build'], {
  cwd: path.join(root, 'frontend'),
  stdio: 'inherit',
  env: process.env,
})
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)

// The tracing root preserves hoisted workspace dependencies in this standalone tree.
const server = path.join(root, 'frontend/.next/standalone/frontend')
if (!fs.existsSync(path.join(server, 'server.js'))) {
  throw new Error('Expected standalone Next.js server was not produced')
}
fs.cpSync(path.join(root, 'frontend/public'), path.join(server, 'public'), {
  recursive: true,
})
fs.cpSync(path.join(root, 'frontend/.next/static'), path.join(server, '.next/static'), {
  recursive: true,
})
console.log('App Hosting runtime: frontend/.next/standalone/frontend/server.js')

'use strict'
/**
 * Runs the Next.js CLI without relying on node_modules/.bin (fixes Windows + pnpm
 * when `next` / `pnpm exec next` is not on PATH).
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const http = require('http')
const https = require('https')

const frontendRoot = path.join(__dirname, '..')
const repoRoot = path.join(frontendRoot, '..')
const cmd = process.argv[2]
const rest = process.argv.slice(3)

if (!cmd) {
  console.error('Usage: node scripts/run-next.cjs <dev|build|start> [...args]')
  process.exit(1)
}

function resolveNextDir() {
  const bases = [frontendRoot, repoRoot]
  for (const base of bases) {
    try {
      const pkgJson = require.resolve('next/package.json', { paths: [base] })
      return path.dirname(pkgJson)
    } catch {
      /* try next base */
    }
  }

  // pnpm: scan node_modules and the virtual store (folder names vary by pnpm version / peers)
  function dirWithNextPackage(root) {
    const direct = path.join(root, 'node_modules', 'next', 'package.json')
    if (fs.existsSync(direct)) return path.dirname(direct)
    const pnpmRoot = path.join(root, 'node_modules', '.pnpm')
    if (!fs.existsSync(pnpmRoot)) return null
    let entries
    try {
      entries = fs.readdirSync(pnpmRoot, { withFileTypes: true })
    } catch {
      return null
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const candidate = path.join(pnpmRoot, ent.name, 'node_modules', 'next', 'package.json')
      if (fs.existsSync(candidate)) return path.dirname(candidate)
    }
    return null
  }

  return dirWithNextPackage(frontendRoot) || dirWithNextPackage(repoRoot)
}

const nextDir = resolveNextDir()
if (!nextDir) {
  console.error(
    'Could not find the "next" package on disk.\n' +
      'From the repo root run:  pnpm install\n' +
      '(The workspace root lists "next" in devDependencies so install must complete there.)',
  )
  process.exit(1)
}

const candidates = [
  path.join(nextDir, 'dist', 'bin', 'next'),
  path.join(nextDir, 'dist', 'bin', 'next.js'),
]
const bin = candidates.find((p) => fs.existsSync(p))

const devLockPath = path.join(frontendRoot, '.next', 'dev', 'lock')
const devLogPath = path.join(frontendRoot, '.next', 'dev', 'logs', 'next-development.log')

function readDevLock() {
  if (!fs.existsSync(devLockPath)) return null

  try {
    return JSON.parse(fs.readFileSync(devLockPath, 'utf8'))
  } catch {
    return null
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function waitForHttpOk(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      resolve(false)
      return
    }

    const client = parsed.protocol === 'https:' ? https : http
    const request = client.get(parsed, (response) => {
      response.resume()
      resolve(response.statusCode != null && response.statusCode < 500)
    })

    request.setTimeout(timeoutMs, () => {
      request.destroy()
      resolve(false)
    })

    request.on('error', () => resolve(false))
  })
}

async function handleDevLock() {
  const devLock = readDevLock()
  if (devLock?.pid && isProcessAlive(devLock.pid)) {
    const appUrl = devLock.appUrl || `http://${devLock.hostname ?? 'localhost'}:${devLock.port ?? 3000}`

    if (await waitForHttpOk(appUrl)) {
      console.log(`Next.js dev server is already running at ${appUrl} (pid ${devLock.pid}). Reusing it.`)
      process.exit(0)
    }

    console.error(
      `A Next.js dev server process exists but is not responding at ${appUrl} (pid ${devLock.pid}).\n` +
        `Run kill ${devLock.pid} to stop it, then run pnpm run dev again.`,
    )
    process.exit(1)
  }

  if (devLock) {
    try {
      fs.unlinkSync(devLockPath)
    } catch {
      /* ignore stale lock cleanup errors */
    }

    try {
      fs.unlinkSync(devLogPath)
    } catch {
      /* ignore stale log cleanup errors */
    }
  }
}

if (cmd === 'dev') {
  handleDevLock()
    .then(runNext)
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
} else {
  runNext()
}

function runNext() {
  if (!bin) {
    console.error(
      `Next.js CLI not found under ${nextDir}. Try deleting node_modules and running pnpm install from the repo root.`,
    )
    process.exit(1)
  }

  const result = spawnSync(process.execPath, [bin, cmd, ...rest], {
    stdio: 'inherit',
    cwd: frontendRoot,
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

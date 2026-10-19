const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

// Approved release-preparation scope; expires at the end of 26 October in Melbourne.
const EXCEPTION = Object.freeze({
  ghsa: 'GHSA-vfj7-8cjw-p6xm',
  module: 'braces',
  version: '3.0.3',
  path: 'frontend>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces',
  expiresAt: '2026-10-26T23:59:59+11:00',
})

/** Reject failed, incomplete or unexpected pnpm 10 audit responses. */
function advisories(report) {
  if (!report || report.error || !report.advisories || typeof report.advisories !== 'object' || Array.isArray(report.advisories)) {
    throw new Error('Missing or failed audit response')
  }
  const entries = Object.values(report.advisories)
  for (const item of entries) {
    if (!/^GHSA-[\w-]+$/.test(item.github_advisory_id ?? '') ||
        !['info', 'low', 'moderate', 'high', 'critical'].includes(item.severity) ||
        typeof item.module_name !== 'string' ||
        !Array.isArray(item.findings) || !item.findings.length ||
        item.findings.some(f => typeof f.version !== 'string' ||
          !Array.isArray(f.paths) || !f.paths.length ||
          f.paths.some(p => typeof p !== 'string'))) {
      throw new Error('Unexpected advisory format')
    }
  }
  for (const level of ['high', 'critical']) {
    const count = report.metadata?.vulnerabilities?.[level]
    const found = entries.filter(a => a.severity === level)
      .reduce((total, a) => total + a.findings.length, 0)
    if (!Number.isInteger(count) || count < 0 || count !== found) {
      throw new Error('Incomplete audit severity counts')
    }
  }
  return entries
}

/** Permit one exact development path; keep every production High/Critical blocking. */
function assessAudit(fullReport, productionReport, now = new Date()) {
  const full = advisories(fullReport)
  const production = advisories(productionReport)
  if (!Number.isFinite(now.getTime()) || now.getTime() >= Date.parse(EXCEPTION.expiresAt)) {
    throw new Error('Audit exception expired; remove it or obtain a new review')
  }
  const blockers = production.filter(a => ['high', 'critical'].includes(a.severity))
    .map(a => 'production: ' + a.github_advisory_id)
  let excepted = 0
  for (const item of full.filter(a => ['high', 'critical'].includes(a.severity))) {
    const allowed = item.github_advisory_id === EXCEPTION.ghsa &&
      item.severity === 'high' && item.module_name === EXCEPTION.module &&
      item.findings.every(f => f.version === EXCEPTION.version &&
        f.paths.every(p => p === EXCEPTION.path)) &&
      !production.some(a => a.github_advisory_id === EXCEPTION.ghsa ||
        a.module_name === EXCEPTION.module)
    if (allowed) excepted += item.findings.length
    else blockers.push('full: ' + item.github_advisory_id)
  }
  return { blockers, excepted }
}

/** Retain complete stdout/stderr before evaluating policy, including failed audits. */
function collectAudit(name, args, directory) {
  const result = spawnSync('pnpm', ['audit', '--audit-level=high', '--json', ...args], {
    encoding: 'utf8', maxBuffer: 25 * 1024 * 1024,
  })
  fs.writeFileSync(path.join(directory, name + '.json'), result.stdout ?? '')
  fs.writeFileSync(path.join(directory, name + '.stderr.log'),
    (result.stderr ?? '') + (result.error ? '\n' + result.error.message : ''))
  return result
}

function main() {
  const directory = path.resolve(__dirname, '..', 'audit-reports')
  fs.mkdirSync(directory, { recursive: true })
  const full = collectAudit('full', [], directory)
  const production = collectAudit('production', ['--prod'], directory)
  for (const result of [full, production]) {
    if (result.error || result.signal || ![0, 1].includes(result.status)) {
      throw new Error('Audit command failed; see unsuppressed audit-reports')
    }
  }
  const fullReport = JSON.parse(full.stdout)
  const productionReport = JSON.parse(production.stdout)
  const result = assessAudit(fullReport, productionReport)
  console.log('Unsuppressed full audit:', fullReport.metadata.vulnerabilities)
  console.log('Unsuppressed production audit:', productionReport.metadata.vulnerabilities)
  console.log('Exact development exception:', result.excepted, EXCEPTION.ghsa,
    'expires', EXCEPTION.expiresAt)
  if (result.blockers.length) throw new Error(result.blockers.join('\n'))
  console.log('PASS: no other High/Critical findings')
}

if (require.main === module) {
  try { main() } catch (error) {
    console.error('FAIL:', error.message)
    process.exitCode = 1
  }
}
module.exports = { EXCEPTION, assessAudit }

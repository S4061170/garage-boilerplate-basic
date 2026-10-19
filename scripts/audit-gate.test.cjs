const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EXCEPTION, assessAudit } = require('./audit-gate.cjs')
const beforeExpiry = new Date('2026-10-26T23:59:58+11:00')

function advisory(overrides = {}) {
  return {
    github_advisory_id: EXCEPTION.ghsa, module_name: EXCEPTION.module, severity: 'high',
    findings: [{ version: EXCEPTION.version, paths: [EXCEPTION.path] }], ...overrides,
  }
}
function report(...items) {
  const count = severity => items.filter(a => a.severity === severity)
    .reduce((total, a) => total + a.findings.length, 0)
  return {
    advisories: Object.fromEntries(items.map((item, i) => [i, item])),
    metadata: { vulnerabilities: { high: count('high'), critical: count('critical') } },
  }
}

test('allows only the exact development exception before its deadline', () => {
  assert.deepEqual(assessAudit(report(advisory()), report(), beforeExpiry),
    { blockers: [], excepted: 1 })
})
test('fails at the exact expiry instant, even when no exception is needed', () => {
  const atExpiry = new Date(EXCEPTION.expiresAt)
  assert.throws(() => assessAudit(report(advisory()), report(), atExpiry), /expired/)
  assert.throws(() => assessAudit(report(), report(), atExpiry), /expired/)
})
test('fails after expiry and rejects an invalid clock value', () => {
  for (const date of [new Date('2026-10-27T00:00:00+11:00'), new Date('invalid')]) {
    assert.throws(() => assessAudit(report(advisory()), report(), date), /expired/)
  }
})
test('blocks every other High and Critical advisory', () => {
  for (const severity of ['high', 'critical']) {
    const other = advisory({ github_advisory_id: 'GHSA-test-other-issue', severity })
    assert.equal(assessAudit(report(advisory(), other), report(), beforeExpiry)
      .blockers.length, 1)
  }
})
test('does not exempt the same GHSA if its severity increases', () => {
  assert.equal(assessAudit(report(advisory({ severity: 'critical' })), report(),
    beforeExpiry).blockers.length, 1)
})
test('blocks changed module, version, or additional dependency paths', () => {
  for (const change of [
    { module_name: 'other' },
    { findings: [{ version: '3.0.4', paths: [EXCEPTION.path] }] },
    { findings: [{ version: EXCEPTION.version, paths: [EXCEPTION.path, 'backend>braces'] }] },
  ]) {
    assert.equal(assessAudit(report(advisory(change)), report(), beforeExpiry)
      .blockers.length, 1)
  }
})
test('blocks the exception if it appears in production', () => {
  assert.ok(assessAudit(report(advisory()), report(advisory()), beforeExpiry)
    .blockers.length > 0)
})
test('blocks production High/Critical even if the full report omits it', () => {
  assert.ok(assessAudit(report(), report(advisory()), beforeExpiry).blockers.length > 0)
})
test('rejects failed, malformed and incomplete audit responses', () => {
  for (const invalid of [null, { error: 'registry unavailable' },
    { advisories: [] }, { advisories: true, metadata: { vulnerabilities: { high: 0, critical: 0 } } }, { advisories: {}, metadata: { vulnerabilities: { high: 1, critical: 0 } } },
    report(advisory({ findings: [] })), report(advisory({ severity: 'unknown' }))]) {
    assert.throws(() => assessAudit(invalid, report(), beforeExpiry))
    assert.throws(() => assessAudit(report(), invalid, beforeExpiry))
  }
})
test('retains the existing Moderate threshold and permits a clean audit', () => {
  assert.deepEqual(assessAudit(report(advisory({ severity: 'moderate' })),
    report(advisory({ severity: 'moderate' })), beforeExpiry), { blockers: [], excepted: 0 })
  assert.deepEqual(assessAudit(report(), report(), beforeExpiry),
    { blockers: [], excepted: 0 })
})

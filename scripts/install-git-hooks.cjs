'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')

// App Hosting builds a source archive; Git hooks apply only to actual checkouts.
if (fs.existsSync(path.join(root, '.git'))) {
  const result = spawnSync(
    process.execPath,
    [require.resolve('lefthook/bin/index.js'), 'install'],
    {
      cwd: root,
      stdio: 'inherit',
    }
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} else {
  console.log('Source archive: Git hook installation is not required')
}

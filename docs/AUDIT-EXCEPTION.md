# Temporary dependency audit exception

The release-preparation instruction authorises one exception to the High/Critical audit gate. This accepts a limited development-tool availability risk; it does not patch the vulnerable package.

| Constraint | Value |
| --- | --- |
| Advisory | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) |
| Package / version | `braces@3.0.3` |
| Exact dependency path | `frontend>eslint-config-next>@next/eslint-plugin-next>fast-glob>micromatch>braces` |
| Severity eligible for exception | High only |
| Expiry | **26 October 2026, 23:59:59 Australia/Melbourne (UTC+11)** |
| Implementation | `scripts/audit-gate.cjs` |
| Regression tests | `scripts/audit-gate.test.cjs` |

The package is resolved through the frontend ESLint development dependency. Production audit results and Next.js server output traces must be reviewed before release. The advisory describes stack exhaustion when processing deeply nested patterns. Its presence in development tooling can affect lint/build infrastructure even when it is absent from production runtime dependencies.

Run `pnpm run audit:ci` under Node 22 and pnpm 10.18.3. It collects both full and production audits, preserving their complete JSON and stderr in `audit-reports/` before evaluating the exception. CI uploads this directory with `if: always()` and retains it for 30 days. The local directory is ignored by Git.

The gate fails when the exception expires, when its GHSA appears in production, when the package/version/path changes, when its severity becomes Critical, or when any other High/Critical advisory occurs in either report. Registry/command failures, invalid JSON and incomplete severity counts also fail. Moderate findings remain visible under the existing High/Critical threshold and receive no exception.

Remove the exception as soon as an upstream patch is adopted or when the package is no longer present. A changed exposure or dependency path requires a fresh review. There is no automatic extension; after the deadline, CI fails until the exception is removed or a new policy is explicitly approved. The expiry applies even if a later audit no longer needs the exception, requiring obsolete policy to be cleaned up.

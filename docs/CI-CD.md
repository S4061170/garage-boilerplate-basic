# CI/CD

## Release status

The CI and Firestore Rules workflows are prepared locally. Dependency remediation preserves Firebase 11.10.0 and pins pnpm 10.18.3 with Node 22. The Security Scan collects unsuppressed full/production audits and applies only the documented [temporary development exception](AUDIT-EXCEPTION.md), with an explicit expiry check and regression tests. Raw audit reports are uploaded even when the job fails.

The required public frontend delivery target is Firebase. The Vercel configuration and provider-specific instructions below are legacy preparation, not the approved release destination. Firebase frontend hosting configuration, provider-side build compatibility, remote CI execution, production Rules deployment and live acceptance remain pending. The SSR application requires a server-capable Firebase deployment; the release report records the prerequisites without claiming a successful cloud release.

The read-only repository inspection on 19 October 2026 confirmed that `S4061170/garage-boilerplate-basic` is public, the default branch is `main`, and `main` is not protected. A workflow file cannot enable branch protection. The required-check policy below therefore remains an approval-dependent remote setup step.

## Pipeline

1. Pull requests targeting `main`, pushes to `main`, and merge-queue events run `.github/workflows/ci.yml`.
2. CI validates placeholders, runs frontend/backend lint and TypeScript checks, frontend and backend unit tests, the 15 Firestore Rules tests in a dedicated Emulator, a frontend production build and the full/production High/Critical audit gate with its narrowly scoped expiry-controlled exception.
3. `Required checks` depends on every validation job and fails if any result is failed, cancelled or skipped. This is the stable check to require on `main`.
4. Once branch protection is enabled, a passing PR can be merged. Vercel's GitHub integration automatically builds and publishes the `frontend/` application from the configured production branch `main`.
5. Independently, a successful **push CI** run on `main` triggers `.github/workflows/deploy.yml`. The Rules job checks out that run's exact tested SHA and publishes only `firestore:rules` to the explicit Firebase project.

The Rules workflow rejects PR workflow completions and completions from another repository. It has read-only GitHub permissions and serialises production Rules deployments. It does not deploy the optional Express Cloud Function. `deploy.yml_notinuse` remains an inactive boilerplate reference.

Vercel does not wait for the post-merge Rules workflow. PR check enforcement is the frontend's pre-merge gate. Deployment acceptance must record that the frontend and Rules releases belong to the intended revision; one successful provider deployment does not establish the other.

## GitHub configuration requiring approval

For `main`, configure branch protection or an equivalent active ruleset:

- Require a pull request and the `Required checks` status from this repository's GitHub Actions CI.
- Require the branch to be up to date before merge, or use the merge queue supported by `merge_group`.
- Apply the required checks to administrators and avoid bypass permissions where the repository settings permit.
- Preserve any existing review or protection settings when applying this policy. A solo assignment does not require adding a second mandatory reviewer merely to enable checks.

The check must first have a real workflow run before GitHub can offer its exact context for selection. After approval to publish the branch, open a PR, collect the CI run, enable the protection, and verify with a deliberately failed check on a temporary PR before relying on merge enforcement. Do not merge a failed PR to demonstrate this.

Create the `production` GitHub environment for the Rules job and provide:

| Secret | Use |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Explicit destination, expected to match the configured Firebase project. |
| `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` | Deployment identity encoded as JSON; its `project_id` must match `FIREBASE_PROJECT_ID`. |

Use a deployment identity permitted to publish Firebase Rules and read the relevant project configuration. Follow the organisation's least-privilege IAM policy rather than granting Owner merely to make deployment work. Runtime Admin credentials for Vercel can be managed separately from this deployment identity.

The workflow decodes the credential into a mode-0600 file under `RUNNER_TEMP`, sets `GOOGLE_APPLICATION_CREDENTIALS`, and deletes the file in an `always()` step. Do not upload the credential, Firebase debug logs from production, or environment files. An environment approval gate, if configured, will pause deployment; record this accurately rather than describing it as an unattended release.

## Vercel configuration requiring approval

Use the existing Garage architecture: a full Next.js server on Vercel, with Server Actions and `/api/auth/session`. The separate Express backend is not called by this feature.

| Setting | Prepared value / required remote setup |
| --- | --- |
| Git repository | `S4061170/garage-boilerplate-basic` |
| Root Directory | `frontend` |
| Include files outside Root Directory | Enable workspace access so the root pnpm workspace/lockfile are available. |
| Framework | Next.js, declared in `frontend/vercel.json` |
| Production Branch | `main` |
| Node runtime | 22.x, matching CI |
| Install/build | `frontend/vercel.json` pins pnpm 10.18.3 and uses the frozen lockfile. |
| Git integration | Enable automatic production deployment on pushes to `main`. |

Provide the public Firebase web configuration under `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` and `NEXT_PUBLIC_FIREBASE_APP_ID`. Also configure `NEXT_PUBLIC_APP_NAME`, the eventual `NEXT_PUBLIC_APP_URL`, and server-only `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`. Never prefix the Admin credential with `NEXT_PUBLIC_`.

Add the final deployment hostname to Firebase Authentication's authorised domains where required by the chosen sign-in flow. Enabling a Git integration or importing a Vercel project can itself trigger a deployment; obtain approval before doing either. Preview deployments with production credentials can access production data, so decide their environment isolation before enabling them.

## Evidence to collect after an approved release

| Evidence | Where to obtain it |
| --- | --- |
| PR and revision | PR URL, merge SHA and CI run URL. |
| Check enforcement | Screenshot of the active protection and a failed required check blocking merge. |
| Vercel frontend | Deployment detail URL, production live URL, source SHA, build log and Ready status. |
| Firestore Rules | `Deploy Firestore Rules` run URL, tested SHA, job summary and the `firestore-rules-deploy-<sha>` artifact. |
| Live acceptance | Signed-in Search/Sort/Save/Load/Delete, refresh persistence, new matching Note, independent Retry after a recoverable failure, and ownership checks in an approved test context. |

The Rules workflow preserves the normal deploy output for 30 days; GitHub also retains its job log. CI preserves the Emulator log for 14 days. Add the verified URLs, outcomes and screenshots to Section 6/7 of the Feature Design & Delivery Document. A localhost or Emulator URL is not the live deployed result.

## Approval sequence

The prepared files require no remote mutation to review. Explicit approval is still needed to commit/push, create a remote PR, change GitHub protections/environments/secrets, link or configure Vercel, change Firebase authorised domains/IAM, and merge or trigger production deployment. Publishing these workflow files to the connected production branch can activate automatic releases. Keep production actions pending until that consequence is approved.

## Provider references

The two deployment paths follow [Vercel Git deployment](https://vercel.com/docs/git), [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json), [GitHub workflow_run](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run), and [GitHub required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). Provider setup and successful remote execution remain separate from these local configuration files.

# CI/CD — Firebase App Hosting and Firestore Rules

## Current state

The deployment target is Firebase App Hosting for the complete Next.js application and GitHub Actions for Firestore Rules. The separate Express backend is not part of Search & save delivery.

[Draft PR #2](https://github.com/S4061170/garage-boilerplate-basic/pull/2) remains unmerged. Main was synchronised into the feature branch at `8dd767c5a9441deb7115048da32f00f262525e20`. Both [automatic PR CI](https://github.com/S4061170/garage-boilerplate-basic/actions/runs/39199829498) and the previously authorised [manual full CI](https://github.com/S4061170/garage-boilerplate-basic/actions/runs/39199824620) passed all seven jobs at that revision: 50 frontend, 5 backend, 15 Rules and 10 audit-policy tests, lint, typechecking and production build.

This configuration change adds the App Hosting packaging and setup instructions. Its PR checks must pass before merge. Production billing, backend creation, secret/IAM changes, Rules publication and release require separate approval.

## CI and Rules release

`.github/workflows/ci.yml` checks placeholders, lint, TypeScript, frontend/backend tests, Firestore Emulator Rules tests, the frontend production build and the full/production dependency audit policy. `Required checks` aggregates every job. The exact development-only audit exception remains unchanged and expires on 26 October 2026 at 23:59:59 Australia/Melbourne; raw audit reports remain available as artifacts.

Configure main branch protection to require this check, an up-to-date branch or merge queue, and a PR. Remote protection is a separate approved action; a workflow file cannot enable it.

The existing `Deploy Firestore Rules` workflow accepts only a successful **push CI on main** from this repository. It checks out `github.event.workflow_run.head_sha` and executes only `firestore:rules` for the explicit project. A PR CI completion does not deploy. The `production` environment must contain:

| Secret                                | Purpose                                                        |
| ------------------------------------- | -------------------------------------------------------------- |
| `FIREBASE_PROJECT_ID`                 | Expected destination: `s4061170-52f3d`.                        |
| `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` | Rules deployment identity; decoded account project must match. |

Grant the deployment identity the permissions needed to publish Rules and read project/service configuration. Review least-privilege IAM against the chosen identity; do not grant Owner to bypass missing permissions. The temporary credential file is mode 0600 and removed in an always step. Normal deployment output is retained for 30 days.

## App Hosting build context

Use **repository root `/`**, not `frontend`, as the App Hosting root directory.

The current provider preparer recognises Nx/Turborepo when preserving a parent monorepo context. For a plain pnpm workspace it treats the selected subdirectory as a standalone application. Selecting `frontend` would therefore omit this repository's root lockfile, overrides and build approvals.

The custom commands are required by the selected deployment layout, rather than by Next.js 16 or Node 22 in general. The selected root contains the pnpm lockfile and hoisted dependencies, but the Next.js app/configuration is under `frontend`; the existing root build also compiles the separate Express backend. An adapter-based alternative would require a different verified workspace/build setup. The current change preserves this layout and explicitly builds only the frontend.

The root `apphosting.yaml` deliberately specifies custom build/run commands. The custom `buildCommand` opts out of the Firebase framework adapter and its framework-specific optimisations; the custom `runCommand` is required to launch the resulting standalone entry point from the selected root:

- Build: `node scripts/build-apphosting.cjs`.
- The script builds only the frontend with Next.js, preserving Server Actions and server routes, then copies public/static assets into its standalone tree.
- `frontend/next.config.ts` enables `output: standalone` and traces dependencies from the repository root.
- Run: `node frontend/.next/standalone/frontend/server.js`.
- Only `frontend/.next/standalone` is retained in the runtime image; the workspace source and development tools are not intentionally shipped.
- The prepare script installs Git hooks only in a Git checkout; source archives without .git skip hook installation without disabling package build scripts.
- Root engines select Node 22 and pnpm 10.18.3. The Firebase SDK remains 11.10.0.
- `HOSTNAME=0.0.0.0`; the generated server reads the platform's `PORT`.

This uses the documented App Hosting custom-command/output mechanism and Next.js standalone packaging. The public active-support table does not establish active adapter support for Next.js 16.3.8. A clean source archive without .git passed frozen installation and the custom production build. Standalone-only server smoke checks, 50 frontend tests, TypeScript and normal checkout hook installation also passed under Node 22. An eventual Cloud Build must still be recorded separately. No Nx/Turborepo dependency or provider adapter is added.

## Environment and session handling

The YAML contains only public Firebase web configuration already used by this application. These browser configuration values are not Admin credentials.

| Configuration                              | Availability                           |
| ------------------------------------------ | -------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Build and runtime                      |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Build and runtime                      |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Build and runtime                      |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Build and runtime                      |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Build and runtime                      |
| `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`      | Runtime only, Secret Manager reference |
| `HOSTNAME`                                 | Runtime only                           |

The proposed Admin secret ID is `garage-admin-service-account-base64`. Its value must be base64-encoded service-account JSON for the same Firebase project. It has not been created or changed. The unchanged initializer uses an explicit certificate; merely assigning a Cloud Run service account does not replace this required variable.

The App Hosting runtime identity needs access to that secret. The identity inside its JSON needs `firebaseauth.users.createSession`, `firebaseauth.users.get` and the Firestore permissions used by the application. Review a narrow custom Auth role and the Firestore data-access role against these operations; the broader predefined Firebase Authentication Admin role must not be granted without approval. Keep this runtime identity separate from the Rules deployment identity where practical. Confirm the intended identities and approve IAM grants before cloud setup.

The session route exchanges a Firebase ID token for an HTTP-only, secure production `__session` cookie with SameSite=Lax and a 14-day duration. Server Components and Server Actions verify the cookie through Firebase Admin. Note creation continues through its existing authenticated Server Action; Saved Views continue through the client SDK and Rules. No static export or client-side rewrite replaces these flows.

The final host must be registered in Firebase Authentication where required by the sign-in method. Preserve HTTPS and the application cookie/origin handling. Authenticated production acceptance requires the approved runtime credential; a successful credential-free build does not validate it.

## Firebase Console setup values

The values below define the proposed first backend; they do not indicate that cloud resources already exist. Backend ID and region require approval before creation. `us-central1` is a supported baseline; confirm it against the existing Firestore location and latency requirements before approving the region.

| Console field           | Value                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| Firebase project        | `s4061170-52f3d` (project number `37648522710`)                                           |
| Proposed backend ID     | `search-save`                                                                             |
| Proposed primary region | `us-central1`                                                                             |
| Repository              | `S4061170/garage-boilerplate-basic`                                                       |
| App root directory      | `/`                                                                                       |
| Live branch             | `main`                                                                                    |
| Runtime                 | `nodejs22`, matching root `engines.node: 22.x`                                            |
| Package manager         | pnpm `10.18.3`, selected by `packageManager` and `engines.pnpm`                           |
| Firebase web app        | `1:37648522710:web:4b463efe0d03271ffb5877`                                                |
| Configuration           | Repository-root `apphosting.yaml`; do not duplicate its variables in Console overrides    |
| Build / start           | `node scripts/build-apphosting.cjs` / `node frontend/.next/standalone/frontend/server.js` |
| Runtime output          | `frontend/.next/standalone`                                                               |
| Scaling                 | Minimum 0 instances; maximum 2 instances                                                  |

Use these public values from `apphosting.yaml` at build and runtime:

| Variable                                   | Value                                      |
| ------------------------------------------ | ------------------------------------------ |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | `AIzaSyDg5db4D46n59hfB-zTYmmdkvzPwWdfNhs`  |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | `s4061170-52f3d.firebaseapp.com`           |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | `s4061170-52f3d`                           |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `37648522710`                              |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | `1:37648522710:web:4b463efe0d03271ffb5877` |

`HOSTNAME=0.0.0.0` is runtime-only; App Hosting supplies `PORT`. Runtime-only `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` references `projects/s4061170-52f3d/secrets/garage-admin-service-account-base64`. Its value is base64 service-account JSON, not a public web key. The YAML's unversioned secret name resolves to the latest version when the backend is built; record the resolved version with release evidence. Do not set local Emulator host variables or import the complete local `.env` into production. Console overrides take precedence over YAML, so inspect the effective values before the first build.

### IAM and production prerequisites

- A project Owner must perform the first backend creation. Approve Blaze billing and the required App Hosting/Cloud Build/Cloud Run/Artifact Registry/Secret Manager/Developer Connect services during onboarding. Retain the provider's generated service-agent grants; grant service-agent roles only to their intended service agents.
- The expected default build/runtime identity is `firebase-app-hosting-compute@s4061170-52f3d.iam.gserviceaccount.com`. Confirm the actual selected identity during creation. Grant `roles/secretmanager.secretAccessor` on the Admin secret to that identity through the App Hosting secret-access flow. Provision the secret and its access before authorising an initial rollout. If onboarding cannot defer rollout until access is ready, stop before its final deployment confirmation.
- The identity embedded in the Admin JSON must belong to `s4061170-52f3d`. It needs a custom Auth role containing `firebaseauth.users.createSession` and `firebaseauth.users.get`, and Firestore data access for authenticated note creation and dashboard profile reads. `roles/datastore.user` is the standard data-access role; it covers more than those two application operations, so review its scope before granting. The runtime credential bypasses client Rules; preserve the existing Server Action session checks. No broad Owner/Editor grant is required for application runtime.
- A separate Rules deployment identity uses `roles/firebaserules.admin`. Review its project/service-read permissions with the pinned CLI before release; required API calls can additionally need `firebase.projects.get`, `resourcemanager.projects.get`, `serviceusage.services.get`, `serviceusage.services.use` and `datastore.databases.get`. Prepare these permissions without granting runtime data-write rights to the Rules identity. The actual first Rules release remains the verification of this identity, not an already observed result.
- GitHub's `production` environment requires `FIREBASE_PROJECT_ID=s4061170-52f3d` and the separate Rules identity's base64 JSON in `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`. This GitHub secret is distinct from the App Hosting Secret Manager secret despite the shared environment-variable name.
- Protect main using the `Required checks` result and a PR before the authorised merge. Register the eventual generated hostname in Firebase Authentication where required, then verify HTTPS session cookies. No final hostname is claimed before backend creation.

## First release and Cloud Build verification

1. Batch the configuration and directly related documentation, validate locally, and make one planned push to the existing feature branch. Allow the normal `pull_request` event to run full CI once. Retain concurrency cancellation, Required checks and the audit gate. Do not dispatch or rerun successful CI jobs.
2. Before merge approval, settle billing, region/backend ID, the Admin secret/access plan, GitHub production credentials and required-check enforcement. Keep the App Hosting backend uncreated. Confirm the audit exception remains valid; it expires on 26 October 2026 at 23:59:59 Australia/Melbourne.
3. After separate approval, merge PR #2 once. Record the resulting main SHA. Its push runs CI automatically; only successful main push CI permits the existing workflow to deploy Firestore Rules from that exact SHA. Stop the first release if CI or Rules deployment fails.
4. After Rules success and separate backend/release approval, create/connect the backend with the values above, targeting the tested main revision. Prepare secret access before final rollout confirmation. Use the creation flow's initial build as the first Cloud Build verification; do not also request a second rollout for the same SHA. Confirm the build's source SHA before it runs, and stop if it differs from the approved main SHA.
5. Inspect that one build's logs for Node 22, pnpm 10.18.3, successful locked workspace installation with the overrides/build allowlist, the source-archive hook skip, the custom frontend build and standalone output. Verify the Cloud Run revision starts the specified server on the platform PORT, serves public/static assets and has the runtime secret binding. Record the Cloud Build URL, rollout URL, image/revision, resolved secret version and public URL. A local build is not evidence of Cloud Build success.
6. Perform approved signed-in acceptance for note creation, Search/Sort, Save/Load/Delete, refresh persistence, current Notes results and Retry. Check session-cookie security and ownership using approved test accounts/data. Reuse the same rollout for evidence.
7. Subsequent authorised merges to main trigger Git-linked App Hosting rollouts and main CI independently. Rules continue to wait for main CI. App Hosting does not automatically wait for that separate workflow: require backward-compatible Rules for ordinary automatic releases, or obtain approval for a coordinated release before incompatible changes. Do not enable GitHub auto-merge as part of this configuration task.

The first release intentionally uses the single backend-creation build after main CI and Rules success. Creating a temporary backend against the feature branch would add builds, costs and release-ordering risks without replacing production acceptance.

## Billing and cost control

Verify whether the existing project already uses Blaze; if it uses Spark, linking an approved Cloud Billing account and upgrading to Blaze requires approval. This review does not change billing. Budget alerts and an approved spending threshold should be configured before backend creation. Alerts and the maximum-instance setting do not establish a hard total-spend cap.

The YAML keeps minimum instances at 0 and maximum instances at 2 to limit idle capacity and scaling. Build time, runtime/egress, image storage and secret/logging usage can still incur charges. Cold starts are possible at a minimum of 0. Review regional latency against the existing database before accepting the proposed region.

For this configuration gate, plan one PR-triggered CI run and zero Firebase Cloud Builds. After release approval, the expected first-release executions are one main CI run, one Rules deployment workflow and one initial App Hosting Cloud Build. Capture existing logs/screenshots without creating extra rollouts or changing branches. Reconsider resource retention after assessment completion with separate approval.

## Release limitations

Cloud Build and authenticated production acceptance remain pending. The custom path for Next.js 16.3.8 is locally validated, but does not establish active Firebase adapter support. A missing/mismatched runtime credential can allow a build to succeed while authenticated requests fail. The final creation flow must not publish the new frontend before its Rules or before its secret access is ready.

## Provider references

- [App Hosting framework/tooling support](https://firebase.google.com/docs/app-hosting/frameworks-tooling)
- [Provider build-directory selection](https://github.com/GoogleCloudPlatform/buildpacks/blob/main/pkg/firebase/util/util.go)
- [Custom build/run and output configuration](https://firebase.google.com/docs/app-hosting/configure)
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [App Hosting rollouts](https://firebase.google.com/docs/app-hosting/rollouts)

- [Firebase Authentication permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaseauth)
- [App Hosting costs](https://firebase.google.com/docs/app-hosting/costs)
- [App Hosting architecture, locations and service account](https://firebase.google.com/docs/app-hosting/about-app-hosting)
- [Firebase Rules permissions](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)

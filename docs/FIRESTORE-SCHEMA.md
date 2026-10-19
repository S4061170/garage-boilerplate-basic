# Firestore Schema

## Overview

All collections use the typed collection pattern — see `frontend/src/lib/firebase/firestore.ts`.
Security rules are in `firebase/firestore.rules`.

When adding a new collection, use the `/firebase-collection` Claude Code skill.

## Schema versioning

Every document in every collection **must** include a `_schemaVersion` field:

```typescript
_schemaVersion: 1  // increment when doing a breaking schema change
```

This enables **lazy migration** — when a document is read, check `_schemaVersion` and migrate on the fly if it's behind current. See the `/evolve-schema` skill for the full migration workflow.

**Rules:**
- `_schemaVersion` is always `1` on creation
- Non-breaking changes (adding optional fields with defaults) keep the same version
- Breaking changes (rename, remove, type change) increment the version and require a migration function
- Never remove `_schemaVersion` from a schema

---

## `users` collection

**Path:** `/users/{userId}`
**Access:** Owner-only (user can read/write their own document; admins can read all)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | `string` | Yes | Firebase Auth UID (same as document ID) |
| `email` | `string` | Yes | User's email address |
| `displayName` | `string \| null` | Yes | Display name from Auth or profile |
| `photoURL` | `string \| null` | Yes | Profile photo URL |
| `role` | `'user' \| 'admin'` | Yes | User role — immutable by user after creation |
| `createdAt` | `Timestamp` | Yes | When the document was created |
| `updatedAt` | `Timestamp` | Yes | When the document was last updated |
| `_schemaVersion` | `1` | Yes | Schema version for lazy migration |

**Creation:** Auto-created by `AuthProvider` on first sign-in via `syncUserProfile()`.
**Deletion:** Hard-delete is disabled in security rules. Use `deletedAt` field for soft-delete.

---

## `notes` collection

**Path:** `/notes/{noteId}`
**Access:** Owner-only

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | `string` | Yes | Owner's Firebase Auth UID |
| `title` | `string` | Yes | Note title, 1-200 characters |
| `body` | `string` | Yes | Note body, up to 10,000 characters |
| `createdAt` | `Timestamp` | Yes | When the document was created |
| `updatedAt` | `Timestamp` | Yes | When the document was last updated |
| `_schemaVersion` | `1` | Yes | Schema version for lazy migration |

**Deletion:** Hard-delete is disabled in security rules. Use `deletedAt` field for soft-delete.

---

## `savedViews` collection

**Path:** `/savedViews/{viewId}`
**Access:** Authenticated owners may create, read and delete their views. All updates, including owner updates and overwrites, are denied.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | `string` | Yes | Must equal the authenticated owner's UID. |
| `name` | `string` | Yes | Trimmed name, 1–60 characters. Duplicate names are permitted. |
| `keyword` | `string` | Yes | Title keyword, at most 100 characters; an empty keyword matches all personal notes. |
| `sortDirection` | `'asc' \| 'desc'` | Yes | Creation-date ordering. |
| `createdAt` | `Timestamp` | Yes | `serverTimestamp()` equal to the Rules request time. |
| `updatedAt` | `Timestamp` | Yes | Equal to `createdAt`; retained to follow the existing metadata convention. |
| `_schemaVersion` | `1` | Yes | Version of the stored settings document. |

Only these seven fields are allowed. Document IDs are added to the runtime type when reading and are not stored fields. A saved view contains search conditions rather than copied notes or result IDs. Loading restores conditions against the current Notes subscription. Deleting a view does not delete notes or change the current filters.

Client SDK writes are checked by `firebase/firestore.rules`. Existing note creation continues to use its server action and Admin SDK validation. The application does not expose a saved-view update operation.

### Local Rules tests

With the Firebase CLI and Java installed, run from the repository root:

```sh
firebase emulators:exec --project demo-notes-saved-views --only firestore --config firebase.rules-test.json "pnpm --filter frontend test:rules"
```

The separate configuration starts an isolated local database on `127.0.0.1:8085`. The test suite rejects non-loopback endpoints and uses a fixed demo project ID. Ordinary `pnpm run test:component` tests keep mocked Firebase access. Local test configuration does not deploy Rules or change the application database.

<!-- Add new collection schemas below using the /firebase-collection skill -->

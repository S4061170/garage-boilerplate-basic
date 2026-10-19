import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app'
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { filterAndSortNotes } from '@/features/notes/lib/filter-and-sort-notes'
import type { Note } from '@/types/firestore'

const projectId = 'demo-notes-saved-views'
const host = process.env.FIRESTORE_EMULATOR_HOST
if (!host || !/^127\.0\.0\.1:\d+$/.test(host)) {
  throw new Error('Run this suite through firebase emulators:exec with firebase.rules-test.json.')
}
const apps: FirebaseApp[] = []
let alice: Firestore
let bob: Firestore
let guest: Firestore

/** Create an isolated Web SDK client with emulator-only authentication. */
function client(name: string, uid?: string): Firestore {
  const app = initializeApp({ projectId, apiKey: 'demo-key' }, name)
  apps.push(app)
  const db = getFirestore(app)
  const [hostname, port] = host!.split(':')
  connectFirestoreEmulator(db, hostname!, Number(port), uid ? { mockUserToken: { sub: uid } } : {})
  return db
}

/** Build a valid server-timestamped document; individual cases change one constraint. */
function validView(overrides: DocumentData = {}): DocumentData {
  return {
    uid: 'alice',
    name: 'Revision',
    keyword: 'Firebase',
    sortDirection: 'desc',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    _schemaVersion: 1,
    ...overrides,
  }
}

beforeAll(() => {
  alice = client('alice', 'alice')
  bob = client('bob', 'bob')
  guest = client('guest')
})
beforeEach(async () => {
  // The demo project and loopback-only host guard prevent contact with live data.
  const response = await fetch(
    `http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' }
  )
  if (!response.ok) throw new Error('Could not clear the isolated emulator database.')
})
afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)))
})

describe('savedViews Firestore Rules', () => {
  it('allows owner creation, scoped listing, reading and deletion', async () => {
    const ref = doc(alice, 'savedViews', 'view-a')
    await setDoc(ref, validView())
    const saved = (await getDocFromServer(ref)).data()!
    expect(saved.name).toBe('Revision')
    expect(saved.createdAt).toBeInstanceOf(Timestamp)
    expect(saved.updatedAt.isEqual(saved.createdAt)).toBe(true)
    expect(
      (await getDocsFromServer(query(collection(alice, 'savedViews'), where('uid', '==', 'alice'))))
        .size
    ).toBe(1)
    await deleteDoc(ref)
    expect(
      (await getDocsFromServer(query(collection(alice, 'savedViews'), where('uid', '==', 'alice'))))
        .empty
    ).toBe(true)
  })

  it('persists conditions across fresh clients and applies them to newly created notes', async () => {
    await setDoc(doc(alice, 'savedViews', 'view-a'), validView())
    const refreshed = client('refreshed', 'alice')
    const settings = (await getDocFromServer(doc(refreshed, 'savedViews', 'view-a'))).data()!
    expect(settings.keyword).toBe('Firebase')
    expect(settings).not.toHaveProperty('noteIds')
    for (const [id, title] of [
      ['old-note', 'Firebase Lecture'],
      ['new-note', 'Firebase Revision'],
    ]) {
      await setDoc(doc(alice, 'notes', id!), {
        uid: 'alice',
        title,
        body: 'Content',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        _schemaVersion: 1,
      })
    }
    const snapshot = await getDocsFromServer(
      query(collection(refreshed, 'notes'), where('uid', '==', 'alice'))
    )
    const notes = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }) as Note)
    expect(
      filterAndSortNotes(notes, {
        keyword: settings.keyword,
        sortDirection: settings.sortDirection,
      })
    ).toHaveLength(2)
  })

  it('rejects unauthenticated create, read, list and delete', async () => {
    await setDoc(doc(alice, 'savedViews', 'view-a'), validView())
    await expect(setDoc(doc(guest, 'savedViews', 'guest-view'), validView())).rejects.toMatchObject(
      { code: 'permission-denied' }
    )
    await expect(getDocFromServer(doc(guest, 'savedViews', 'view-a'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await expect(getDocsFromServer(collection(guest, 'savedViews'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await expect(deleteDoc(doc(guest, 'savedViews', 'view-a'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })

  it('rejects forged ownership, cross-user reads/deletes and unscoped lists', async () => {
    await setDoc(doc(alice, 'savedViews', 'view-a'), validView())
    await expect(setDoc(doc(bob, 'savedViews', 'forged'), validView())).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await expect(getDocFromServer(doc(bob, 'savedViews', 'view-a'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await expect(deleteDoc(doc(bob, 'savedViews', 'view-a'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await expect(getDocsFromServer(collection(alice, 'savedViews'))).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })

  it('rejects every update and overwrite, including requests from the owner', async () => {
    await setDoc(doc(alice, 'savedViews', 'view-a'), validView())
    await expect(
      updateDoc(doc(alice, 'savedViews', 'view-a'), { name: 'Changed' })
    ).rejects.toMatchObject({ code: 'permission-denied' })
    await expect(updateDoc(doc(bob, 'savedViews', 'view-a'), { uid: 'bob' })).rejects.toMatchObject(
      { code: 'permission-denied' }
    )
    await expect(setDoc(doc(alice, 'savedViews', 'view-a'), validView())).rejects.toMatchObject({
      code: 'permission-denied',
    })
    expect((await getDocFromServer(doc(alice, 'savedViews', 'view-a'))).data()!.name).toBe(
      'Revision'
    )
  })

  it('keeps the existing Notes listener working when another query is rejected', async () => {
    const noteData = {
      uid: 'alice',
      title: 'Firebase Lecture',
      body: 'Content',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      _schemaVersion: 1,
    }
    await setDoc(doc(alice, 'notes', 'note-a'), noteData)
    let ids: string[] = []
    let viewError: string | null = null
    let notesError: Error | null = null
    const stopNotes = onSnapshot(
      query(collection(alice, 'notes'), where('uid', '==', 'alice')),
      (snapshot) => {
        ids = snapshot.docs.map((item) => item.id)
      },
      (error) => {
        notesError = error
      }
    )
    // An unrestricted query is deliberately denied, like an unavailable collection.
    const stopViews = onSnapshot(
      collection(alice, 'savedViews'),
      () => {},
      (error) => {
        viewError = error.code
      }
    )
    try {
      await vi.waitFor(() => {
        expect(viewError).toBe('permission-denied')
        expect(ids).toEqual(['note-a'])
      })
      await setDoc(doc(alice, 'notes', 'note-b'), { ...noteData, title: 'Firebase Revision' })
      await vi.waitFor(() => expect(ids).toContain('note-b'))
      expect(notesError).toBeNull()
    } finally {
      stopViews()
      stopNotes()
    }
  })

  it.each([
    ['blank name', { name: '   ' }],
    ['oversized name', { name: 'x'.repeat(61) }],
    ['oversized keyword', { keyword: 'x'.repeat(101) }],
    ['invalid direction', { sortDirection: 'newest' }],
    ['unexpected field', { extra: true }],
    ['wrong type', { keyword: 123 }],
    ['invalid version', { _schemaVersion: 2 }],
    ['forged timestamp', { createdAt: Timestamp.fromMillis(0) }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(
      setDoc(doc(alice, 'savedViews', 'invalid'), validView(overrides))
    ).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('requires every field and accepts valid boundary lengths', async () => {
    const missing = validView()
    delete missing.keyword
    await expect(setDoc(doc(alice, 'savedViews', 'missing'), missing)).rejects.toMatchObject({
      code: 'permission-denied',
    })
    await setDoc(
      doc(alice, 'savedViews', 'boundary'),
      validView({ name: 'x'.repeat(60), keyword: 'x'.repeat(100), sortDirection: 'asc' })
    )
    await setDoc(
      doc(alice, 'savedViews', 'empty-keyword'),
      validView({ name: 'All notes', keyword: '' })
    )
  })
})

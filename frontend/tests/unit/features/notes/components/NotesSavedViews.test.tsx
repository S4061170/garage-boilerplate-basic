import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesList } from '@/features/notes/components/NotesList'
import type { Note, SavedView } from '@/types/firestore'

const { authState, onSnapshotMock } = vi.hoisted(() => ({
  authState: { loading: false, user: { uid: 'user-a' } },
  onSnapshotMock: vi.fn(),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))
vi.mock('@/lib/firebase/firestore', () => ({
  getNotesCollection: () => 'notes',
  getSavedViewsCollection: () => 'savedViews',
}))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  query: (collection: string) => collection,
  where: vi.fn(),
  onSnapshot: onSnapshotMock,
}))
vi.mock('@/features/notes/lib/saved-views', () => ({
  saveSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
}))

interface Subscription {
  collection: string
  next: (snapshot: {
    metadata: { hasPendingWrites: boolean }
    docs: { id: string; data: () => Note | SavedView }[]
  }) => void
  error: (error: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}
const subscriptions: Subscription[] = []
const timestamp = new Timestamp(100, 0)
const note: Note = {
  id: 'note-a',
  uid: 'user-a',
  title: 'Firebase Lecture',
  body: 'Content',
  createdAt: timestamp,
  updatedAt: timestamp,
  _schemaVersion: 1,
}
const view: SavedView = {
  id: 'view-a',
  uid: 'user-a',
  name: 'Revision',
  keyword: 'Firebase',
  sortDirection: 'asc',
  createdAt: timestamp,
  updatedAt: timestamp,
  _schemaVersion: 1,
}

/** Send independent notes or saved-view snapshots to the latest account subscription. */
function publish(
  collection: string,
  rows: (Note | SavedView)[],
  target = subscriptions.filter((sub) => sub.collection === collection).at(-1)!
) {
  act(() =>
    target.next({
      metadata: { hasPendingWrites: false },
      docs: rows.map((row) => ({ id: row.id, data: () => row })),
    })
  )
}

describe('Notes and Saved Views integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriptions.length = 0
    authState.user = { uid: 'user-a' }
    onSnapshotMock.mockImplementation(
      (collection: string, second: unknown, third: unknown, fourth: unknown) => {
        const next = (collection === 'notes' ? second : third) as Subscription['next']
        const error = (collection === 'notes' ? third : fourth) as Subscription['error']
        const subscription = { collection, next, error, unsubscribe: vi.fn() }
        subscriptions.push(subscription)
        return subscription.unsubscribe
      }
    )
  })
  afterEach(cleanup)

  it('restores saved controls and computes results using new Notes snapshots', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publish('notes', [note, { ...note, id: 'unrelated', title: 'JavaScript Lecture' }])
    publish('savedViews', [view])
    await user.click(screen.getByRole('button', { name: 'Load Revision' }))
    expect(screen.getByRole('searchbox', { name: 'Title keyword' })).toHaveValue('Firebase')
    expect(screen.getByRole('combobox', { name: 'Created date' })).toHaveValue('asc')
    expect(screen.getByRole('status')).toHaveTextContent('1 matching note')
    const newer = {
      ...note,
      id: 'new-note',
      title: 'Firebase Revision',
      createdAt: new Timestamp(200, 0),
    }
    publish('notes', [newer, note])
    const results = within(screen.getByRole('region', { name: 'Search notes' }))
    expect(
      results.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    ).toEqual(['Firebase Lecture', 'Firebase Revision'])
    expect(results.getByRole('status')).toHaveTextContent('2 matching notes')
    expect(onSnapshotMock).toHaveBeenCalledTimes(2)
  })

  it('keeps saved views usable after a terminal Notes listener error', () => {
    render(<NotesList />)
    publish('savedViews', [view])
    act(() =>
      subscriptions.find((sub) => sub.collection === 'notes')!.error(new Error('Notes unavailable'))
    )
    expect(screen.getByRole('button', { name: 'Load Revision' })).toBeEnabled()
    expect(screen.getByText('Could not load notes')).toBeInTheDocument()
  })

  it('keeps Notes usable after a terminal saved views listener error', () => {
    render(<NotesList />)
    publish('notes', [note])
    act(() =>
      subscriptions
        .find((sub) => sub.collection === 'savedViews')!
        .error(new Error('Views unavailable'))
    )
    expect(screen.getByRole('heading', { name: 'Firebase Lecture' })).toBeInTheDocument()
    expect(screen.getByText(/Could not load saved views/)).toBeInTheDocument()
  })

  it('retries each failed panel without restarting the other subscription', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publish('notes', [note])
    publish('savedViews', [view])
    await user.click(screen.getByRole('button', { name: 'Load Revision' }))
    const oldNotes = subscriptions.find((sub) => sub.collection === 'notes')!
    const oldViews = subscriptions.find((sub) => sub.collection === 'savedViews')!
    act(() => {
      oldNotes.error(new Error('Notes unavailable'))
      oldViews.error(new Error('Views unavailable'))
    })
    await user.click(screen.getByRole('button', { name: 'Retry notes' }))
    expect(oldNotes.unsubscribe).toHaveBeenCalledTimes(1)
    expect(oldViews.unsubscribe).not.toHaveBeenCalled()
    publish('notes', [note])
    expect(screen.getByRole('heading', { name: 'Firebase Lecture' })).toBeInTheDocument()
    expect(screen.getByText('Could not load saved views.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry saved views' }))
    publish('savedViews', [view])
    expect(oldViews.unsubscribe).toHaveBeenCalledTimes(1)
    expect(onSnapshotMock).toHaveBeenCalledTimes(4)
    expect(screen.getByRole('searchbox', { name: 'Title keyword' })).toHaveValue('Firebase')
    expect(screen.getByRole('combobox', { name: 'Created date' })).toHaveValue('asc')
    expect(screen.getByRole('button', { name: 'Load Revision' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('clears both panels and old callbacks when the active account changes', () => {
    const { rerender } = render(<NotesList />)
    publish('notes', [note])
    publish('savedViews', [view])
    const previous = [...subscriptions]
    authState.user = { uid: 'user-b' }
    rerender(<NotesList />)
    for (const subscription of previous) expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    publish(
      'notes',
      [note],
      previous.find((sub) => sub.collection === 'notes')!
    )
    publish(
      'savedViews',
      [view],
      previous.find((sub) => sub.collection === 'savedViews')!
    )
    expect(screen.queryByRole('button', { name: 'Load Revision' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Firebase Lecture' })).not.toBeInTheDocument()
    publish('notes', [])
    publish('savedViews', [])
    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByText(/No saved views yet/)).toBeInTheDocument()
  })
})

import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotesList } from '@/features/notes/components/NotesList'
import type { Note } from '@/types/firestore'

const { authState, onSnapshotMock, queryMock, whereMock } = vi.hoisted(() => ({
  authState: { loading: false, user: { uid: 'user-a' } as { uid: string } | null },
  onSnapshotMock: vi.fn(),
  queryMock: vi.fn(),
  whereMock: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }))
// These Stage 1 cases isolate note rendering; Saved Views has separate integration cases.
vi.mock('@/features/notes/components/SavedViewsPanel', () => ({ SavedViewsPanel: () => null }))
vi.mock('@/lib/firebase/firestore', () => ({ getNotesCollection: () => 'notes' }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  onSnapshot: onSnapshotMock,
  query: queryMock,
  where: whereMock,
}))

interface Subscription {
  next: (snapshot: { docs: { id: string; data: () => Note }[] }) => void
  error: (error: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}

const subscriptions: Subscription[] = []

/** Create realistic note data without writing to Firebase. */
function makeNote(id: string, title: string, seconds: number, uid = 'user-a'): Note {
  const timestamp = new Timestamp(seconds, 0)
  return {
    id,
    uid,
    title,
    body: 'Lecture content',
    createdAt: timestamp,
    updatedAt: timestamp,
    _schemaVersion: 1,
  }
}

/** Deliver a snapshot to the selected subscription inside React's update boundary. */
function publishNotes(notes: Note[], subscription = subscriptions[subscriptions.length - 1]!) {
  act(() => subscription.next({ docs: notes.map((note) => ({ id: note.id, data: () => note })) }))
}

/** Read the visible card order rather than component state. */
function visibleTitles() {
  return screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
}

describe('NotesList', () => {
  const notes = [
    makeNote('older', 'Firebase Lecture', 100),
    makeNote('other', 'JavaScript Assignment', 150),
    makeNote('newer', 'Firebase Revision', 200),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    subscriptions.length = 0
    authState.loading = false
    authState.user = { uid: 'user-a' }
    whereMock.mockImplementation((...args: unknown[]) => args)
    queryMock.mockImplementation((...args: unknown[]) => args)
    onSnapshotMock.mockImplementation(
      (_query: unknown, next: Subscription['next'], error: Subscription['error']) => {
        const subscription = { next, error, unsubscribe: vi.fn() }
        subscriptions.push(subscription)
        return subscription.unsubscribe
      }
    )
  })

  afterEach(cleanup)

  it('waits for authentication and the first owner-scoped snapshot', () => {
    authState.loading = true
    const { rerender } = render(<NotesList />)

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(onSnapshotMock).not.toHaveBeenCalled()

    authState.loading = false
    rerender(<NotesList />)
    expect(whereMock).toHaveBeenCalledWith('uid', '==', 'user-a')
    expect(queryMock).toHaveBeenCalledWith('notes', ['uid', '==', 'user-a'])
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument()

    publishNotes(notes)
    expect(screen.getByRole('status')).toHaveTextContent('3 matching notes')
    expect(visibleTitles()).toEqual([
      'Firebase Revision',
      'JavaScript Assignment',
      'Firebase Lecture',
    ])
  })

  it('searches case-insensitively with trimmed whitespace and updates the count', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publishNotes(notes)

    await user.type(screen.getByRole('searchbox', { name: 'Title keyword' }), '  fIrEbAsE  ')
    expect(visibleTitles()).toEqual(['Firebase Revision', 'Firebase Lecture'])
    expect(screen.getByRole('status')).toHaveTextContent('2 matching notes')
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })

  it('changes creation-date order and clears both controls back to their defaults', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publishNotes(notes)

    const search = screen.getByRole('searchbox', { name: 'Title keyword' })
    const sort = screen.getByRole('combobox', { name: 'Created date' })
    await user.type(search, 'Firebase')
    await user.selectOptions(sort, 'asc')
    expect(visibleTitles()).toEqual(['Firebase Lecture', 'Firebase Revision'])

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(search).toHaveValue('')
    expect(sort).toHaveValue('desc')
    expect(screen.getByRole('status')).toHaveTextContent('3 matching notes')
    expect(visibleTitles()).toEqual([
      'Firebase Revision',
      'JavaScript Assignment',
      'Firebase Lecture',
    ])
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })

  it('distinguishes an empty collection from an unsuccessful search', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publishNotes([])

    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByText('Create a note using the form above.')).toBeInTheDocument()
    expect(screen.queryByText('No matching notes')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 matching notes')

    publishNotes(notes)
    await user.type(screen.getByRole('searchbox', { name: 'Title keyword' }), 'unknown')
    expect(screen.getByText('No matching notes')).toBeInTheDocument()
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('0 matching notes')

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText('No matching notes')).not.toBeInTheDocument()
    expect(visibleTitles()).toHaveLength(3)
  })

  it('keeps current filters when a newly created note arrives', async () => {
    const user = userEvent.setup()
    render(<NotesList />)
    publishNotes(notes)
    await user.type(screen.getByRole('searchbox', { name: 'Title keyword' }), 'Firebase')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Created date' }), 'asc')

    publishNotes([...notes, makeNote('latest', 'Firebase Assignment', 300)])
    expect(visibleTitles()).toEqual([
      'Firebase Lecture',
      'Firebase Revision',
      'Firebase Assignment',
    ])
    expect(screen.getByRole('status')).toHaveTextContent('3 matching notes')
    expect(onSnapshotMock).toHaveBeenCalledTimes(1)
  })

  it('shows a singular result count and preserves existing note content', () => {
    render(<NotesList />)
    publishNotes([notes[0]!])

    expect(screen.getByRole('status')).toHaveTextContent('1 matching note')
    expect(within(screen.getByRole('listitem')).getByText('Lecture content')).toBeInTheDocument()
  })

  it('shows subscription failures instead of stale cards or an empty result', () => {
    render(<NotesList />)
    publishNotes(notes)
    act(() => subscriptions[0]!.error(new Error('Permission denied')))

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load notes')
    expect(screen.getByRole('alert')).toHaveTextContent('Permission denied')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument()
  })

  it('retries with new listeners and preserves filters through repeated terminal errors', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<NotesList />)
    publishNotes(notes)
    await user.type(screen.getByRole('searchbox', { name: 'Title keyword' }), 'Firebase')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Created date' }), 'asc')
    act(() => subscriptions[0]!.error(new Error('Unavailable')))
    await user.click(screen.getByRole('button', { name: 'Retry notes' }))
    expect(subscriptions[0]!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry notes' })).not.toBeInTheDocument()
    act(() => subscriptions[1]!.error(new Error('Still unavailable')))
    await user.click(screen.getByRole('button', { name: 'Retry notes' }))
    expect(subscriptions[1]!.unsubscribe).toHaveBeenCalledTimes(1)
    publishNotes(notes)
    expect(onSnapshotMock).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('searchbox', { name: 'Title keyword' })).toHaveValue('Firebase')
    expect(screen.getByRole('combobox', { name: 'Created date' })).toHaveValue('asc')
    expect(visibleTitles()).toEqual(['Firebase Lecture', 'Firebase Revision'])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    unmount()
    expect(subscriptions[2]!.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('clears old account data, ignores late callbacks and unsubscribes on account changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<NotesList />)
    publishNotes(notes)
    await user.type(screen.getByRole('searchbox', { name: 'Title keyword' }), 'Firebase')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Created date' }), 'asc')
    const previous = subscriptions[0]!

    authState.user = { uid: 'user-b' }
    rerender(<NotesList />)
    expect(previous.unsubscribe).toHaveBeenCalledTimes(1)
    expect(whereMock).toHaveBeenLastCalledWith('uid', '==', 'user-b')
    expect(screen.queryByText('Firebase Lecture')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()

    publishNotes(notes, previous)
    act(() => previous.error(new Error('Late error from previous account')))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()

    publishNotes([makeNote('private', 'Biology Lecture', 400, 'user-b')])
    expect(visibleTitles()).toEqual(['Biology Lecture'])
    expect(screen.getByRole('searchbox', { name: 'Title keyword' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Created date' })).toHaveValue('desc')

    authState.user = null
    rerender(<NotesList />)
    expect(subscriptions[1]!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Biology Lecture')).not.toBeInTheDocument()
    expect(onSnapshotMock).toHaveBeenCalledTimes(2)
  })

  it('releases the subscription on unmount', () => {
    const { unmount } = render(<NotesList />)
    const subscription = subscriptions[0]!
    unmount()

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
  })
})

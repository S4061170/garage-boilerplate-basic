'use client'

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { NotesSearchControls } from '@/features/notes/components/NotesSearchControls'
import { SavedViewsPanel } from '@/features/notes/components/SavedViewsPanel'
import { filterAndSortNotes, type SortDirection } from '@/features/notes/lib/filter-and-sort-notes'
import { useAuth } from '@/hooks/useAuth'
import { getNotesCollection } from '@/lib/firebase/firestore'
import type { Note } from '@/types/firestore'

/** Remount account-specific state before displaying a different user's notes. */
export function NotesList() {
  const { loading, user } = useAuth()

  if (loading || !user) return <LoadingSpinner />

  return <UserNotesList key={user.uid} uid={user.uid} />
}

/** Subscribe to one account and derive its visible notes from the search controls. */
function UserNotesList({ uid }: { uid: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    let active = true
    const notesQuery = query(getNotesCollection(), where('uid', '==', uid))
    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        if (!active) return
        setNotes(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })))
        setError(null)
        setLoading(false)
      },
      (err) => {
        if (!active) return
        setError(err)
        setLoading(false)
      }
    )

    return () => {
      // Ignore late callbacks after an account change or unmount.
      active = false
      unsubscribe()
    }
  }, [uid, subscriptionAttempt])

  /** Replace a terminated listener while retaining the current search conditions. */
  function retryNotes() {
    setError(null)
    setLoading(true)
    setSubscriptionAttempt((attempt) => attempt + 1)
  }

  /** Restore the default conditions without changing stored notes. */
  function clearFilters() {
    setKeyword('')
    setSortDirection('desc')
  }

  const matchingNotes = filterAndSortNotes(notes, { keyword, sortDirection })

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-label="Search notes" className="space-y-4">
        <NotesSearchControls
          keyword={keyword}
          sortDirection={sortDirection}
          onKeywordChange={setKeyword}
          onSortDirectionChange={setSortDirection}
          onClear={clearFilters}
        />
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <div role="alert">
            <EmptyState title="Could not load notes" description={error.message} />
            <button
              type="button"
              aria-label="Retry notes"
              onClick={retryNotes}
              className="mt-2 rounded-md border px-3 py-1.5 text-sm"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <p role="status" aria-live="polite" className="text-sm text-zinc-500">
              {matchingNotes.length} matching {matchingNotes.length === 1 ? 'note' : 'notes'}
            </p>
            {notes.length === 0 ? (
              <EmptyState title="No notes yet" description="Create a note using the form above." />
            ) : matchingNotes.length === 0 ? (
              <EmptyState
                title="No matching notes"
                description="Try another title keyword or clear the filters."
              />
            ) : (
              <ul className="space-y-2">
                {matchingNotes.map((note) => (
                  <li key={note.id} className="rounded-lg border p-4">
                    <h3 className="font-medium">{note.title}</h3>
                    <p className="text-sm text-zinc-500">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      <SavedViewsPanel
        uid={uid}
        keyword={keyword}
        sortDirection={sortDirection}
        onLoad={(view) => {
          setKeyword(view.keyword)
          setSortDirection(view.sortDirection)
        }}
      />
    </div>
  )
}

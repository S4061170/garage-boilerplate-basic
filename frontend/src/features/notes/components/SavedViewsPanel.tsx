'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import type { SortDirection } from '@/features/notes/lib/filter-and-sort-notes'
import { savedViewInputSchema } from '@/features/notes/lib/saved-view-schema'
import { deleteSavedView, saveSavedView } from '@/features/notes/lib/saved-views'
import { getSavedViewsCollection } from '@/lib/firebase/firestore'
import type { SavedView } from '@/types/firestore'

interface SavedViewsPanelProps {
  uid: string
  keyword: string
  sortDirection: SortDirection
  onLoad: (view: SavedView) => void
}

/** Persist private search settings independently of the Notes subscription. */
export function SavedViewsPanel({ uid, keyword, sortDirection, onLoad }: SavedViewsPanelProps) {
  const [views, setViews] = useState<SavedView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    let active = true
    const viewsQuery = query(getSavedViewsCollection(), where('uid', '==', uid))
    const unsubscribe = onSnapshot(
      viewsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!active || snapshot.metadata.hasPendingWrites) return
        setViews(
          snapshot.docs
            .map((doc) => ({ ...doc.data(), id: doc.id }))
            .sort(
              (first, second) =>
                first.name.localeCompare(second.name) || first.id.localeCompare(second.id)
            )
        )
        setLoadError(false)
        setLoading(false)
      },
      () => {
        if (!active) return
        setLoadError(true)
        setLoading(false)
      }
    )
    return () => {
      active = false
      mounted.current = false
      unsubscribe()
    }
  }, [uid, subscriptionAttempt])

  /** Start a new read after a terminal error without discarding the draft name. */
  function retrySavedViews() {
    setLoadError(false)
    setLoading(true)
    setSubscriptionAttempt((attempt) => attempt + 1)
  }

  /** Save a new document rather than modifying a previously loaded view. */
  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setActionError(null)
    const parsed = savedViewInputSchema.safeParse({ name, keyword, sortDirection })
    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? 'Check the view settings.')
      return
    }
    setSaving(true)
    try {
      await saveSavedView(uid, parsed.data)
      if (!mounted.current) return
      setName('')
      toast.success('View saved')
    } catch {
      if (mounted.current) setActionError('Could not save view. Please try again.')
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  /** Remove only the selected view and retain the current search conditions. */
  async function handleDelete(id: string) {
    if (deletingId) return
    setActionError(null)
    setDeletingId(id)
    try {
      await deleteSavedView(id)
      if (mounted.current) toast.success('View deleted')
    } catch {
      if (mounted.current) setActionError('Could not delete view. Please try again.')
    } finally {
      if (mounted.current) setDeletingId(null)
    }
  }

  return (
    <aside aria-label="Saved views" className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Saved views</h2>
      <form aria-label="Save current view" onSubmit={handleSave} className="space-y-2">
        <label htmlFor="saved-view-name" className="text-sm font-medium">
          View name
        </label>
        <input
          id="saved-view-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          disabled={saving}
          aria-describedby={actionError ? 'saved-view-action-error' : undefined}
          placeholder="e.g. Firebase Revision"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {saving ? 'Saving...' : 'Save view'}
        </button>
      </form>
      {actionError && (
        <p
          id="saved-view-action-error"
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {actionError}
        </p>
      )}
      {loading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-600 dark:text-red-400">Could not load saved views.</p>
          <button
            type="button"
            aria-label="Retry saved views"
            onClick={retrySavedViews}
            className="rounded-md border px-3 py-1.5 text-sm"
          >
            Retry
          </button>
        </div>
      ) : views.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No saved views yet. Name the current search and select Save view.
        </p>
      ) : (
        <ul aria-label="Saved view list" className="space-y-3">
          {views.map((view) => (
            <li key={view.id} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium break-words">{view.name}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label={`Load ${view.name}`}
                  onClick={() => onLoad(view)}
                  className="rounded-md border px-3 py-1.5 text-sm"
                >
                  Load
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${view.name}`}
                  disabled={deletingId !== null}
                  onClick={() => handleDelete(view.id)}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {deletingId === view.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

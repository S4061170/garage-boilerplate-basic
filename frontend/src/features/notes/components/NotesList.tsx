'use client'

import { useEffect, useState } from 'react'
import { onSnapshot, query, where } from 'firebase/firestore'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useAuth } from '@/hooks/useAuth'
import { getNotesCollection } from '@/lib/firebase/firestore'
import type { Note } from '@/types/firestore'

export function NotesList() {
  const { loading: authLoading, user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user?.uid) {
      return
    }

    const notesQuery = query(getNotesCollection(), where('uid', '==', user.uid))
    const unsubscribe = onSnapshot(
      notesQuery,
      (snapshot) => {
        setNotes(snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })))
        setError(null)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user?.uid])

  if (authLoading || !user || loading) return <LoadingSpinner />
  if (error) return <EmptyState title="Could not load notes" description={error.message} />
  if (notes.length === 0) return <EmptyState title="No notes yet" />

  return (
    <ul className="space-y-2">
      {notes.map((note) => (
        <li key={note.id} className="rounded-lg border p-4">
          <h3 className="font-medium">{note.title}</h3>
          <p className="text-sm text-zinc-500">{note.body}</p>
        </li>
      ))}
    </ul>
  )
}

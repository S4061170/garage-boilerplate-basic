import type { Note } from '@/types/firestore'

export type SortDirection = 'asc' | 'desc'

interface NoteSearchOptions {
  keyword?: string
  sortDirection?: SortDirection
}

/** Match titles and order Firestore timestamps without changing the source notes. */
export function filterAndSortNotes(
  notes: readonly Note[],
  { keyword = '', sortDirection = 'desc' }: NoteSearchOptions = {}
): Note[] {
  const search = keyword.trim().toLowerCase()
  const direction = sortDirection === 'asc' ? 1 : -1

  return notes
    .filter((note) => note.title.toLowerCase().includes(search))
    .sort((first, second) => {
      const timestampOrder =
        first.createdAt.seconds - second.createdAt.seconds ||
        first.createdAt.nanoseconds - second.createdAt.nanoseconds

      // Equal timestamps keep the same ID order in either sort direction.
      return timestampOrder === 0 ? first.id.localeCompare(second.id) : timestampOrder * direction
    })
}

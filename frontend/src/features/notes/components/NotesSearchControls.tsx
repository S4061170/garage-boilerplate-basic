import type { SortDirection } from '@/features/notes/lib/filter-and-sort-notes'

interface NotesSearchControlsProps {
  keyword: string
  sortDirection: SortDirection
  onKeywordChange: (keyword: string) => void
  onSortDirectionChange: (direction: SortDirection) => void
  onClear: () => void
}

/** Keep the current title search and creation-date order visible together. */
export function NotesSearchControls({
  keyword,
  sortDirection,
  onKeywordChange,
  onSortDirectionChange,
  onClear,
}: NotesSearchControlsProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <label htmlFor="notes-keyword" className="text-sm font-medium">
          Title keyword
        </label>
        <input
          id="notes-keyword"
          type="search"
          maxLength={100}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="Search titles..."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="notes-sort-direction" className="text-sm font-medium">
          Created date
        </label>
        <select
          id="notes-sort-direction"
          value={sortDirection}
          onChange={(event) => onSortDirectionChange(event.target.value === 'asc' ? 'asc' : 'desc')}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus:ring-2 focus:ring-zinc-500 focus:outline-none dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Clear filters
      </button>
    </div>
  )
}

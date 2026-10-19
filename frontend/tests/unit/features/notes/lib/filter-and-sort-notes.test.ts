import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { filterAndSortNotes } from '@/features/notes/lib/filter-and-sort-notes'
import type { Note } from '@/types/firestore'

/** Build records with explicit timestamp precision for ordering tests. */
function makeNote(id: string, title: string, seconds: number, nanoseconds = 0): Note {
  const timestamp = new Timestamp(seconds, nanoseconds)
  return {
    id,
    uid: 'user-a',
    title,
    body: 'Firebase appears in the body only',
    createdAt: timestamp,
    updatedAt: timestamp,
    _schemaVersion: 1,
  }
}

describe('filterAndSortNotes', () => {
  const notes = [
    makeNote('older', 'Firebase Lecture', 100),
    makeNote('unrelated', 'JavaScript Assignment', 150),
    makeNote('newer', 'FIREBASE Revision', 200),
  ]

  it('trims the keyword and matches titles without case sensitivity', () => {
    const result = filterAndSortNotes(notes, { keyword: '  fIrEbAsE  ' })

    expect(result.map((note) => note.id)).toEqual(['newer', 'older'])
  })

  it('does not search the body or treat separate words as separate terms', () => {
    expect(filterAndSortNotes([notes[1]!], { keyword: 'Firebase' })).toEqual([])
    expect(filterAndSortNotes(notes, { keyword: 'Firebase Revision' })).toHaveLength(1)
    expect(filterAndSortNotes(notes, { keyword: 'Firebase Lecture Revision' })).toEqual([])
  })

  it.each(['', '   '])('matches every title with the empty keyword %j', (keyword) => {
    expect(filterAndSortNotes(notes, { keyword })).toHaveLength(3)
  })

  it('defaults to newest-first order', () => {
    expect(filterAndSortNotes(notes).map((note) => note.id)).toEqual([
      'newer',
      'unrelated',
      'older',
    ])
  })

  it('supports oldest-first order', () => {
    expect(filterAndSortNotes(notes, { sortDirection: 'asc' }).map((note) => note.id)).toEqual([
      'older',
      'unrelated',
      'newer',
    ])
  })

  it.each(['asc', 'desc'] as const)('compares nanoseconds when sorting %s', (sortDirection) => {
    const preciseNotes = [
      makeNote('later', 'Later', 100, 200),
      makeNote('earlier', 'Earlier', 100, 100),
    ]
    const expected = sortDirection === 'asc' ? ['earlier', 'later'] : ['later', 'earlier']

    expect(filterAndSortNotes(preciseNotes, { sortDirection }).map((note) => note.id)).toEqual(
      expected
    )
  })

  it.each(['asc', 'desc'] as const)(
    'uses ascending IDs for tied timestamps when sorting %s',
    (sortDirection) => {
      const tiedNotes = [makeNote('b', 'Second', 100), makeNote('a', 'First', 100)]

      expect(filterAndSortNotes(tiedNotes, { sortDirection }).map((note) => note.id)).toEqual([
        'a',
        'b',
      ])
    }
  )

  it('returns a new array without changing the source order or records', () => {
    const source = Object.freeze(notes.map((note) => Object.freeze({ ...note })))
    const result = filterAndSortNotes(source)

    expect(result).not.toBe(source)
    expect(source.map((note) => note.id)).toEqual(['older', 'unrelated', 'newer'])
    expect(result[0]).toBe(source[2])
  })

  it('returns no matches for an unknown keyword or an empty collection', () => {
    expect(filterAndSortNotes(notes, { keyword: 'unknown' })).toEqual([])
    expect(filterAndSortNotes([])).toEqual([])
  })
})

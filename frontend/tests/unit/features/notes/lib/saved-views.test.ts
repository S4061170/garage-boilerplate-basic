import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteSavedView, saveSavedView } from '@/features/notes/lib/saved-views'
import { savedViewInputSchema } from '@/features/notes/lib/saved-view-schema'

const { addDocMock, deleteDocMock, timestamp } = vi.hoisted(() => ({
  addDocMock: vi.fn(),
  deleteDocMock: vi.fn(),
  timestamp: { serverTimestamp: true },
}))
vi.mock('firebase/firestore', () => ({
  addDoc: addDocMock,
  deleteDoc: deleteDocMock,
  serverTimestamp: () => timestamp,
}))
vi.mock('@/lib/firebase/firestore', () => ({
  getSavedViewsCollection: () => 'savedViews',
  savedViewDoc: (id: string) => `savedViews/${id}`,
}))

describe('saved view operations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves trimmed conditions with the owner and server timestamps, without note results', async () => {
    addDocMock.mockResolvedValue({ id: 'new-view' })
    await expect(
      saveSavedView('user-a', {
        name: '  Revision  ',
        keyword: '  Firebase  ',
        sortDirection: 'desc',
      })
    ).resolves.toBe('new-view')
    expect(addDocMock).toHaveBeenCalledWith('savedViews', {
      uid: 'user-a',
      name: 'Revision',
      keyword: 'Firebase',
      sortDirection: 'desc',
      createdAt: timestamp,
      updatedAt: timestamp,
      _schemaVersion: 1,
    })
  })

  it.each([
    { name: '   ', keyword: '', sortDirection: 'desc' },
    { name: 'x'.repeat(61), keyword: '', sortDirection: 'desc' },
    { name: 'Revision', keyword: 'x'.repeat(101), sortDirection: 'desc' },
    { name: 'Revision', keyword: '', sortDirection: 'newest' },
  ])('rejects invalid settings before a write: %j', (input) => {
    expect(savedViewInputSchema.safeParse(input).success).toBe(false)
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('permits an empty keyword and boundary-length fields', () => {
    expect(
      savedViewInputSchema.safeParse({
        name: 'x'.repeat(60),
        keyword: 'x'.repeat(100),
        sortDirection: 'asc',
      }).success
    ).toBe(true)
    expect(
      savedViewInputSchema.safeParse({ name: 'All notes', keyword: '', sortDirection: 'desc' })
        .success
    ).toBe(true)
  })

  it('deletes only the chosen saved-view document', async () => {
    deleteDocMock.mockResolvedValue(undefined)
    await deleteSavedView('view-a')
    expect(deleteDocMock).toHaveBeenCalledWith('savedViews/view-a')
    expect(addDocMock).not.toHaveBeenCalled()
  })

  it('propagates rejected writes so the interface can report failure', async () => {
    addDocMock.mockRejectedValue(new Error('Permission denied'))
    await expect(
      saveSavedView('user-a', { name: 'Revision', keyword: '', sortDirection: 'desc' })
    ).rejects.toThrow('Permission denied')
    deleteDocMock.mockRejectedValue(new Error('Permission denied'))
    await expect(deleteSavedView('view-a')).rejects.toThrow('Permission denied')
  })
})

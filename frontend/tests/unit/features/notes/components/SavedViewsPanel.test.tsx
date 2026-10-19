import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SavedViewsPanel } from '@/features/notes/components/SavedViewsPanel'
import type { SavedView } from '@/types/firestore'

const { onSnapshotMock, saveMock, deleteMock, successMock, whereMock } = vi.hoisted(() => ({
  onSnapshotMock: vi.fn(),
  saveMock: vi.fn(),
  deleteMock: vi.fn(),
  successMock: vi.fn(),
  whereMock: vi.fn(),
}))
vi.mock('firebase/firestore', () => ({
  onSnapshot: onSnapshotMock,
  query: (...args: unknown[]) => args,
  where: whereMock,
}))
vi.mock('@/lib/firebase/firestore', () => ({ getSavedViewsCollection: () => 'savedViews' }))
vi.mock('@/features/notes/lib/saved-views', () => ({
  saveSavedView: saveMock,
  deleteSavedView: deleteMock,
}))
vi.mock('sonner', () => ({ toast: { success: successMock } }))

interface Subscription {
  next: (snapshot: {
    metadata: { hasPendingWrites: boolean }
    docs: { id: string; data: () => SavedView }[]
  }) => void
  error: (error: Error) => void
  unsubscribe: ReturnType<typeof vi.fn>
}
const subscriptions: Subscription[] = []
const view = {
  id: 'view-a',
  uid: 'user-a',
  name: 'Revision',
  keyword: 'Firebase',
  sortDirection: 'asc',
} as SavedView

/** Publish only the fields consumed by this panel's typed subscription. */
function publishViews(
  views: SavedView[],
  pending = false,
  subscription = subscriptions[subscriptions.length - 1]!
) {
  act(() =>
    subscription.next({
      metadata: { hasPendingWrites: pending },
      docs: views.map((item) => ({ id: item.id, data: () => item })),
    })
  )
}

describe('SavedViewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    subscriptions.length = 0
    saveMock.mockResolvedValue('new-view')
    deleteMock.mockResolvedValue(undefined)
    onSnapshotMock.mockImplementation(
      (
        _query: unknown,
        _options: unknown,
        next: Subscription['next'],
        error: Subscription['error']
      ) => {
        const subscription = { next, error, unsubscribe: vi.fn() }
        subscriptions.push(subscription)
        return subscription.unsubscribe
      }
    )
  })
  afterEach(cleanup)

  it('subscribes to the owner and distinguishes loading from an empty list', () => {
    render(<SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={vi.fn()} />)
    expect(whereMock).toHaveBeenCalledWith('uid', '==', 'user-a')
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    publishViews([])
    expect(screen.getByText(/No saved views yet/)).toBeInTheDocument()
  })

  it('validates names and saves the current conditions as a new view', async () => {
    const user = userEvent.setup()
    render(
      <SavedViewsPanel uid="user-a" keyword=" Firebase " sortDirection="asc" onLoad={vi.fn()} />
    )
    publishViews([])
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a view name.')
    expect(saveMock).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'View name' }), ' Revision ')
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    expect(saveMock).toHaveBeenCalledWith('user-a', {
      name: 'Revision',
      keyword: 'Firebase',
      sortDirection: 'asc',
    })
    expect(screen.getByRole('textbox', { name: 'View name' })).toHaveValue('')
    expect(successMock).toHaveBeenCalledWith('View saved')
  })

  it('loads the saved conditions without querying or copying notes', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn()
    render(<SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={onLoad} />)
    publishViews([view])
    await user.click(screen.getByRole('button', { name: 'Load Revision' }))
    expect(onLoad).toHaveBeenCalledWith(view)
    expect(saveMock).not.toHaveBeenCalled()
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('retains the draft name after a failed save and allows retry', async () => {
    const user = userEvent.setup()
    saveMock.mockRejectedValueOnce(new Error('Permission denied'))
    render(
      <SavedViewsPanel uid="user-a" keyword="Firebase" sortDirection="desc" onLoad={vi.fn()} />
    )
    publishViews([])
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Revision')
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save view')
    expect(screen.getByRole('textbox', { name: 'View name' })).toHaveValue('Revision')
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    expect(saveMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('blocks repeat saves and does not display unacknowledged documents', async () => {
    const user = userEvent.setup()
    let resolveSave!: (id: string) => void
    saveMock.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSave = resolve
        })
    )
    render(<SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={vi.fn()} />)
    publishViews([])
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Revision')
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    publishViews([view], true)
    expect(screen.queryByRole('button', { name: 'Load Revision' })).not.toBeInTheDocument()
    await act(async () => resolveSave('view-a'))
    publishViews([view])
    expect(screen.getByRole('button', { name: 'Load Revision' })).toBeInTheDocument()
    expect(saveMock).toHaveBeenCalledTimes(1)
  })

  it('retains a failed deletion and removes the entry after a confirmed deletion', async () => {
    const user = userEvent.setup()
    deleteMock.mockRejectedValueOnce(new Error('Permission denied'))
    render(<SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={vi.fn()} />)
    publishViews([view])
    await user.click(screen.getByRole('button', { name: 'Delete Revision' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not delete view')
    expect(screen.getByRole('button', { name: 'Load Revision' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Revision' }))
    publishViews([])
    expect(deleteMock).toHaveBeenLastCalledWith('view-a')
    expect(screen.queryByRole('button', { name: 'Load Revision' })).not.toBeInTheDocument()
  })

  it('keeps the save form available when the list subscription fails', () => {
    render(<SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={vi.fn()} />)
    act(() => subscriptions[0]!.error(new Error('Permission denied')))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load saved views')
    expect(screen.getByRole('button', { name: 'Save view' })).toBeEnabled()
  })

  it('retries terminal read failures with new listeners and retains the draft name', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <SavedViewsPanel uid="user-a" keyword="Firebase" sortDirection="asc" onLoad={vi.fn()} />
    )
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Draft revision')
    act(() => subscriptions[0]!.error(new Error('Unavailable')))
    await user.click(screen.getByRole('button', { name: 'Retry saved views' }))
    expect(subscriptions[0]!.unsubscribe).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    act(() => subscriptions[1]!.error(new Error('Still unavailable')))
    await user.click(screen.getByRole('button', { name: 'Retry saved views' }))
    expect(subscriptions[1]!.unsubscribe).toHaveBeenCalledTimes(1)
    publishViews([view])
    expect(onSnapshotMock).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('textbox', { name: 'View name' })).toHaveValue('Draft revision')
    expect(screen.getByRole('button', { name: 'Load Revision' })).toBeEnabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(saveMock).not.toHaveBeenCalled()
    unmount()
    expect(subscriptions[2]!.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes and ignores late snapshots and save completions after unmount', async () => {
    const user = userEvent.setup()
    let resolveSave!: (id: string) => void
    saveMock.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveSave = resolve
        })
    )
    const { unmount } = render(
      <SavedViewsPanel uid="user-a" keyword="" sortDirection="desc" onLoad={vi.fn()} />
    )
    publishViews([])
    await user.type(screen.getByRole('textbox', { name: 'View name' }), 'Revision')
    await user.click(screen.getByRole('button', { name: 'Save view' }))
    const subscription = subscriptions[0]!
    unmount()
    publishViews([view], false, subscription)
    await act(async () => resolveSave('view-a'))
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1)
    expect(successMock).not.toHaveBeenCalled()
  })
})

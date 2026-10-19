import { addDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { savedViewInputSchema, type SavedViewInput } from '@/features/notes/lib/saved-view-schema'
import { getSavedViewsCollection, savedViewDoc } from '@/lib/firebase/firestore'

/** Store reusable conditions; ownership and timestamps are checked by Firestore Rules. */
export async function saveSavedView(uid: string, input: SavedViewInput): Promise<string> {
  const settings = savedViewInputSchema.parse(input)
  const ref = await addDoc(getSavedViewsCollection(), {
    ...settings,
    uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    _schemaVersion: 1,
  })
  return ref.id
}

/** Delete a saved condition document; Rules authorise its owner and notes are untouched. */
export async function deleteSavedView(id: string): Promise<void> {
  await deleteDoc(savedViewDoc(id))
}

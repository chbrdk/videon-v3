import { updateMediaStorageKey } from '@/lib/db/media'
import { mediaSourceStorageKeyCandidates } from '@/lib/storage/object-store'
import type { S3ObjectStore } from '@/lib/storage/s3-object-store'

/**
 * Resolve a readable media source key: try stored (if sane) then canonical.
 * Heals DB when the object lives at the canonical path but storage_key is wrong.
 */
export async function resolveMediaSourceStorageKey(input: {
  store: Pick<S3ObjectStore, 'objectExists'>
  workspaceId: string
  mediaAssetId: string
  storageKey: string
}): Promise<string | null> {
  const candidates = mediaSourceStorageKeyCandidates({
    workspaceId: input.workspaceId,
    mediaAssetId: input.mediaAssetId,
    storageKey: input.storageKey,
  })
  for (const storageKey of candidates) {
    try {
      const exists = await input.store.objectExists({
        workspaceId: input.workspaceId,
        storageKey,
      })
      if (!exists) continue
      if (storageKey !== input.storageKey) {
        await updateMediaStorageKey({
          mediaAssetId: input.mediaAssetId,
          workspaceId: input.workspaceId,
          storageKey,
        }).catch(() => null)
      }
      return storageKey
    } catch {
      /* try next */
    }
  }
  return null
}

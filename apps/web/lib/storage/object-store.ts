export function mediaSourceStorageKey(workspaceId: string, mediaAssetId: string): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  return `${safe(workspaceId, 'workspaceId')}/media/${safe(mediaAssetId, 'mediaAssetId')}/source`
}

export type CreateUploadTargetInput = {
  workspaceId: string
  mediaAssetId: string
  mimeType: string
  bytes: number
}

export type UploadTarget = {
  storageKey: string
  uploadUrl: string
  headers: Record<string, string>
  expiresAt: string
}

export type CreateDownloadTargetInput = {
  workspaceId: string
  mediaAssetId: string
  storageKey: string
  disposition?: 'inline' | 'attachment'
}

/**
 * The only storage boundary used by media APIs/workers. Implementations must create
 * short-lived signed URLs and validate key scope; browser code never accesses provider credentials.
 */
export interface ObjectStore {
  createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget>
  createDownloadTarget(input: CreateDownloadTargetInput): Promise<UploadTarget>
  putObjectFromBody(input: {
    workspaceId: string
    storageKey: string
    mimeType: string
    bytes: number
    body: ReadableStream<Uint8Array> | null
  }): Promise<void>
  removeObject(input: { workspaceId: string; storageKey: string }): Promise<void>
}

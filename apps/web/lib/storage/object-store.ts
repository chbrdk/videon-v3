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
  removeObject(input: { workspaceId: string; storageKey: string }): Promise<void>
}

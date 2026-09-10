export function mediaSourceStorageKey(workspaceId: string, mediaAssetId: string): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  return `${safe(workspaceId, 'workspaceId')}/media/${safe(mediaAssetId, 'mediaAssetId')}/source`
}

/** True when key is exactly the canonical source object path. */
export function isCanonicalMediaSourceKey(
  storageKey: string,
  workspaceId: string,
  mediaAssetId: string,
): boolean {
  try {
    return storageKey === mediaSourceStorageKey(workspaceId, mediaAssetId)
  } catch {
    return false
  }
}

/**
 * Detect broken pointers like `workspaceId/` (prefix only) that pass workspace scoping
 * but never point at an uploaded source object.
 */
export function isCorruptMediaSourceKey(
  storageKey: string,
  workspaceId: string,
  mediaAssetId?: string,
): boolean {
  const key = String(storageKey || '').trim()
  const ws = String(workspaceId || '').trim()
  if (!key || !ws) return true
  const prefix = `${ws}/`
  if (key === ws || key === prefix) return true
  if (!key.startsWith(prefix)) return true
  if (!key.includes('/media/')) return true
  if (mediaAssetId && !key.includes(`/media/${mediaAssetId}/`)) return true
  if (!/\/source$/.test(key)) return true
  return false
}

/**
 * Ordered candidates for reading a media source: stored key (if sane) then canonical.
 */
export function mediaSourceStorageKeyCandidates(input: {
  workspaceId: string
  mediaAssetId: string
  storageKey?: string | null
}): string[] {
  const canonical = mediaSourceStorageKey(input.workspaceId, input.mediaAssetId)
  const stored = String(input.storageKey || '').trim()
  const out: string[] = []
  if (
    stored &&
    !isCorruptMediaSourceKey(stored, input.workspaceId, input.mediaAssetId) &&
    stored !== canonical
  ) {
    out.push(stored)
  }
  out.push(canonical)
  return out
}

export function mediaStemStorageKey(
  workspaceId: string,
  mediaAssetId: string,
  stemKind: 'voice' | 'music',
): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  if (stemKind !== 'voice' && stemKind !== 'music') {
    throw new Error('stemKind must be voice or music')
  }
  return `${safe(workspaceId, 'workspaceId')}/media/${safe(mediaAssetId, 'mediaAssetId')}/stems/${stemKind}.wav`
}

export function cutExportStorageKey(
  workspaceId: string,
  cutId: string,
  exportId: string,
  format: 'mp4' | 'premiere_xml' = 'mp4',
): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  // premiere_xml ships as ZIP (XMEML + media/); see specs/domain/cut-export-extras.md
  const ext = format === 'premiere_xml' ? 'zip' : 'mp4'
  return `${safe(workspaceId, 'workspaceId')}/cuts/${safe(cutId, 'cutId')}/exports/${safe(exportId, 'exportId')}.${ext}`
}

export function mediaReframeStorageKey(workspaceId: string, mediaAssetId: string, reframeId: string): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  return `${safe(workspaceId, 'workspaceId')}/media/${safe(mediaAssetId, 'mediaAssetId')}/derivatives/reframe/${safe(reframeId, 'reframeId')}.mp4`
}

/** Eager / write-through JPEG posters for Frame API (Wave 4). */
export function mediaPosterStorageKey(
  workspaceId: string,
  mediaAssetId: string,
  maxWidth: number,
  tMs: number,
): string {
  const safe = (value: string, label: string) => {
    const trimmed = value.trim()
    if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
    return trimmed
  }
  const w = Math.floor(maxWidth)
  const t = Math.floor(tMs)
  if (!Number.isFinite(w) || w <= 0) throw new Error('maxWidth must be positive')
  if (!Number.isFinite(t) || t < 0) throw new Error('tMs must be ≥ 0')
  return `${safe(workspaceId, 'workspaceId')}/media/${safe(mediaAssetId, 'mediaAssetId')}/posters/w${w}/t${t}.jpg`
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
  filename?: string
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

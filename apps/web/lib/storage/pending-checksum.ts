/** Placeholder until the object is stored and hashed server-side after browser PUT. */
export function pendingChecksumForMedia(mediaAssetId: string): string {
  return `pending:${mediaAssetId}`
}

export function isPendingChecksum(checksumSha256: string): boolean {
  return checksumSha256.startsWith('pending:')
}

import { describe, expect, it } from 'vitest'
import { pendingChecksumForMedia, isPendingChecksum } from '@/lib/storage/pending-checksum'
import { sha256HexFromStream } from '@/lib/storage/object-checksum'
import { mediaSourceStorageKey } from '@/lib/storage/object-store'

describe('mediaSourceStorageKey', () => {
  it('scopes uploads under workspace/media/id/source', () => {
    expect(mediaSourceStorageKey('workspace-1', 'media-1')).toBe('workspace-1/media/media-1/source')
  })
})

describe('pending checksum placeholders', () => {
  it('creates a unique pending token per media asset', () => {
    const pending = pendingChecksumForMedia('11111111-1111-4111-8111-111111111111')
    expect(pending).toBe('pending:11111111-1111-4111-8111-111111111111')
    expect(isPendingChecksum(pending)).toBe(true)
    expect(isPendingChecksum('a'.repeat(64))).toBe(false)
  })
})

describe('sha256HexFromStream', () => {
  it('hashes streamed chunks', async () => {
    async function* chunks() {
      yield new TextEncoder().encode('hello ')
      yield new TextEncoder().encode('world')
    }
    const digest = await sha256HexFromStream(chunks())
    expect(digest).toHaveLength(64)
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
  })
})

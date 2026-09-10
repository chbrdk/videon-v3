// @ts-nocheck
import { describe, expect, it } from 'vitest'
import {
  isCorruptMediaSourceKey,
  mediaSourceStorageKey,
  mediaSourceStorageKeyCandidates,
} from '@/lib/storage/object-store'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('media source storage key healing', () => {
  it('flags prefix-only keys as corrupt', () => {
    const ws = 'dead0e7d-99bb-44de-9ea4-394f848bb3dd'
    const mediaId = '11111111-1111-1111-1111-111111111111'
    expect(isCorruptMediaSourceKey(`${ws}/`, ws, mediaId)).toBe(true)
    expect(isCorruptMediaSourceKey(ws, ws, mediaId)).toBe(true)
    expect(isCorruptMediaSourceKey(`${ws}/media/${mediaId}/source`, ws, mediaId)).toBe(false)
    expect(isCorruptMediaSourceKey(`${ws}/media/other/source`, ws, mediaId)).toBe(true)
  })

  it('prefers canonical source key after corrupt stored key', () => {
    const ws = 'dead0e7d-99bb-44de-9ea4-394f848bb3dd'
    const mediaId = '22222222-2222-2222-2222-222222222222'
    const candidates = mediaSourceStorageKeyCandidates({
      workspaceId: ws,
      mediaAssetId: mediaId,
      storageKey: `${ws}/`,
    })
    expect(candidates).toEqual([mediaSourceStorageKey(ws, mediaId)])
  })

  it('export pipeline downloads via healed candidates', () => {
    const src = readFileSync(join(__dirname, '../lib/pipeline/export-cut.ts'), 'utf8')
    expect(src).toContain('downloadMediaSourceToFile')
    expect(src).toContain('resolveMediaSourceStorageKey')
    expect(src).toContain('Re-upload this media')
  })

  it('adobe-download resolves source keys before signing', () => {
    const route = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/adobe-download/route.ts'),
      'utf8',
    )
    expect(route).toContain('resolveMediaSourceStorageKey')
    expect(route).toContain('Re-upload this media')
  })

  it('stream and playback heal source keys', () => {
    const stream = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/stream/route.ts'),
      'utf8',
    )
    const playback = readFileSync(
      join(__dirname, '../app/api/media/[mediaAssetId]/playback/route.ts'),
      'utf8',
    )
    expect(stream).toContain('resolveMediaSourceStorageKey')
    expect(playback).toContain('resolveMediaSourceStorageKey')
  })

  it('restore rejects missing source objects', () => {
    const route = readFileSync(join(__dirname, '../app/api/cuts/[cutId]/route.ts'), 'utf8')
    expect(route).toContain('Source media missing in storage')
    expect(route).toContain('findMediaAssetDetail')
  })
})

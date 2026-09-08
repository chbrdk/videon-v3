import { describe, expect, it } from 'vitest'
import { mediaReframeStorageKey } from '@/lib/storage/object-store'
import { buildReframeIdempotencyKey } from '@/lib/db/media-reframes'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('media reframe contracts', () => {
  it('scopes derivative storage keys to workspace/media', () => {
    expect(mediaReframeStorageKey('ws-1', 'media-1', 'ref-1')).toBe(
      'ws-1/media/media-1/derivatives/reframe/ref-1.mp4',
    )
    expect(() => mediaReframeStorageKey('ws/../x', 'm', 'r')).toThrow(/opaque/)
  })

  it('builds stable idempotency keys for the same params', () => {
    const a = buildReframeIdempotencyKey({
      mediaAssetId: 'm1',
      aspectRatio: '9:16',
      smoothingFactor: 0.3,
      saliencyModel: 'robust_v1',
    })
    const b = buildReframeIdempotencyKey({
      mediaAssetId: 'm1',
      aspectRatio: '9:16',
      smoothingFactor: 0.3,
      saliencyModel: 'robust_v1',
    })
    const c = buildReframeIdempotencyKey({
      mediaAssetId: 'm1',
      aspectRatio: '1:1',
      smoothingFactor: 0.3,
      saliencyModel: 'robust_v1',
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith('reframe:')).toBe(true)
  })

  it('wires durable reframe job name and worker registration', () => {
    const constants = readFileSync(join(process.cwd(), 'lib/pipeline/constants.ts'), 'utf8')
    const queue = readFileSync(join(process.cwd(), 'lib/jobs/pg-boss-queue.ts'), 'utf8')
    const worker = readFileSync(join(process.cwd(), 'lib/pipeline/worker.ts'), 'utf8')
    expect(constants).toMatch(/REFRAME_JOB_NAME = 'videon\.media\.reframe'/)
    expect(queue).toMatch(/enqueueMediaReframeJob/)
    expect(worker).toMatch(/registerMediaReframeHandler/)
  })
})

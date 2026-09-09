import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { extractFrameJpegBytes } from '@/lib/pipeline/frame-sample'
import {
  FRAME_WIDTH_BIN,
  FRAME_WIDTH_DEFAULT,
  FRAME_WIDTH_TIMELINE,
  FRAME_WIDTH_TIERS,
  mediaFrameSeekMs,
  snapFrameWidth,
  type FrameWidthTier,
} from '@/lib/frame-poster-tiers'
import { mediaPosterStorageKey } from '@/lib/storage/object-store'
import type { S3ObjectStore } from '@/lib/storage/s3-object-store'

export {
  FRAME_WIDTH_BIN,
  FRAME_WIDTH_DEFAULT,
  FRAME_WIDTH_TIMELINE,
  FRAME_WIDTH_TIERS,
  mediaFrameSeekMs,
  snapFrameWidth,
}
export type { FrameWidthTier }

export async function uploadPosterJpeg(input: {
  store: S3ObjectStore
  workspaceId: string
  mediaAssetId: string
  maxWidth: number
  tMs: number
  jpeg: Buffer
}): Promise<void> {
  const tMs = mediaFrameSeekMs(input.tMs)
  const maxWidth = snapFrameWidth(input.maxWidth)
  const storageKey = mediaPosterStorageKey(input.workspaceId, input.mediaAssetId, maxWidth, tMs)
  const tempPath = join(tmpdir(), `videon-poster-up-${randomUUID()}.jpg`)
  try {
    await writeFile(tempPath, input.jpeg)
    await input.store.uploadFileFromPath({
      workspaceId: input.workspaceId,
      storageKey,
      filePath: tempPath,
      mimeType: 'image/jpeg',
    })
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

export async function readPosterJpeg(input: {
  store: S3ObjectStore
  workspaceId: string
  mediaAssetId: string
  maxWidth: number
  tMs: number
}): Promise<Buffer | null> {
  const tMs = mediaFrameSeekMs(input.tMs)
  const maxWidth = snapFrameWidth(input.maxWidth)
  const storageKey = mediaPosterStorageKey(input.workspaceId, input.mediaAssetId, maxWidth, tMs)
  try {
    return await input.store.downloadObjectBytes({
      workspaceId: input.workspaceId,
      storageKey,
    })
  } catch {
    return null
  }
}

/**
 * Warm mid + default + scene-start posters into object storage during analysis.
 * Failures are non-fatal — Frame route can still extract on demand.
 */
export async function warmMediaPosterFrames(input: {
  store: S3ObjectStore
  workspaceId: string
  mediaAssetId: string
  sourcePath: string
  durationMs: number | null
  sceneStartMs?: number[]
}): Promise<number> {
  const mid =
    typeof input.durationMs === 'number' && input.durationMs > 0
      ? Math.floor(input.durationMs / 2)
      : 1000
  const seeks = new Set<number>([mediaFrameSeekMs(1000), mediaFrameSeekMs(mid)])
  for (const start of input.sceneStartMs ?? []) {
    if (Number.isFinite(start) && start >= 0) seeks.add(mediaFrameSeekMs(start))
  }

  let stored = 0
  for (const tMs of seeks) {
    const widths: FrameWidthTier[] =
      tMs === mediaFrameSeekMs(mid) || tMs === mediaFrameSeekMs(1000)
        ? [...FRAME_WIDTH_TIERS]
        : [FRAME_WIDTH_BIN, FRAME_WIDTH_TIMELINE]
    for (const maxWidth of widths) {
      const jpeg = await extractFrameJpegBytes(input.sourcePath, tMs, { maxWidth })
      if (!jpeg) continue
      try {
        await uploadPosterJpeg({
          store: input.store,
          workspaceId: input.workspaceId,
          mediaAssetId: input.mediaAssetId,
          maxWidth,
          tMs,
          jpeg,
        })
        stored += 1
      } catch {
        // non-fatal
      }
    }
  }
  return stored
}

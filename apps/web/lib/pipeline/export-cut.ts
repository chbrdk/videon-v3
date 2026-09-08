import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { findCut, listScenesForCut, type Cut, type CutScene } from '@/lib/db/cuts'
import {
  findCutExport,
  markCutExportFailed,
  markCutExportRunning,
  markCutExportSucceeded,
} from '@/lib/db/cut-exports'
import { findMediaAssetDetail, type MediaAssetDetail } from '@/lib/db/media'
import { buildPremiereXmeml } from '@/lib/pipeline/export-premiere-xml'
import { cutExportStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const execFileAsync = promisify(execFile)

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

/** True when stream-copy concat is unsafe (multi-source or canvas mismatch). */
export function cutExportNeedsNormalize(
  cut: Pick<Cut, 'width' | 'height' | 'frameRate'>,
  scenes: Array<Pick<CutScene, 'mediaAssetId'>>,
  mediaById: Map<string, Pick<MediaAssetDetail, 'width' | 'height' | 'frameRate'>>,
): boolean {
  const uniqueMedia = new Set(scenes.map((scene) => scene.mediaAssetId))
  if (uniqueMedia.size > 1) return true
  for (const mediaId of uniqueMedia) {
    const media = mediaById.get(mediaId)
    if (!media) return true
    if (cut.width != null && media.width != null && cut.width !== media.width) return true
    if (cut.height != null && media.height != null && cut.height !== media.height) return true
    if (
      cut.frameRate != null &&
      media.frameRate != null &&
      Math.abs(Number(cut.frameRate) - Number(media.frameRate)) > 0.05
    ) {
      return true
    }
  }
  return false
}

async function extractSegmentCopy(input: {
  sourcePath: string
  startMs: number
  endMs: number
  destinationPath: string
}): Promise<void> {
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seconds(input.startMs),
      '-to',
      seconds(input.endMs),
      '-i',
      input.sourcePath,
      '-c',
      'copy',
      '-y',
      input.destinationPath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  )
}

async function extractSegmentReencode(input: {
  sourcePath: string
  startMs: number
  endMs: number
  destinationPath: string
  width: number
  height: number
  frameRate: number
}): Promise<void> {
  const fps = Number.isFinite(input.frameRate) && input.frameRate > 0 ? input.frameRate : 25
  const w = input.width > 0 ? input.width : 1280
  const h = input.height > 0 ? input.height : 720
  const filter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${fps}`
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seconds(input.startMs),
      '-to',
      seconds(input.endMs),
      '-i',
      input.sourcePath,
      '-vf',
      filter,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      '-movflags',
      '+faststart',
      '-y',
      input.destinationPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )
}

async function concatSegments(
  segmentPaths: string[],
  destinationPath: string,
  reencode: boolean,
): Promise<void> {
  const listPath = join(tmpdir(), `videon-export-list-${randomUUID()}.txt`)
  const listBody = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(listPath, listBody, 'utf8')
  try {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      ...(reencode
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k']
        : ['-c', 'copy']),
      '-movflags',
      '+faststart',
      '-y',
      destinationPath,
    ]
    await execFileAsync('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 })
  } finally {
    await unlink(listPath).catch(() => {})
  }
}

async function buildSegments(input: {
  scenes: CutScene[]
  sourceCache: Map<string, string>
  reencode: boolean
  cut: Cut
}): Promise<string[]> {
  const segmentPaths: string[] = []
  const width = input.cut.width && input.cut.width > 0 ? input.cut.width : 1280
  const height = input.cut.height && input.cut.height > 0 ? input.cut.height : 720
  const frameRate = input.cut.frameRate && input.cut.frameRate > 0 ? input.cut.frameRate : 25

  for (const scene of input.scenes) {
    const sourcePath = input.sourceCache.get(scene.mediaAssetId)
    if (!sourcePath) throw new Error(`Source media unavailable for scene ${scene.id}`)
    const segmentPath = join(tmpdir(), `videon-export-segment-${scene.id}-${randomUUID()}.mp4`)
    if (input.reencode) {
      await extractSegmentReencode({
        sourcePath,
        startMs: scene.startMs,
        endMs: scene.endMs,
        destinationPath: segmentPath,
        width,
        height,
        frameRate,
      })
    } else {
      await extractSegmentCopy({
        sourcePath,
        startMs: scene.startMs,
        endMs: scene.endMs,
        destinationPath: segmentPath,
      })
    }
    segmentPaths.push(segmentPath)
  }
  return segmentPaths
}

async function runPremiereXmlExport(input: {
  exportId: string
  cut: Cut
  scenes: CutScene[]
}): Promise<void> {
  const mediaById = new Map<string, MediaAssetDetail>()
  for (const scene of input.scenes) {
    if (mediaById.has(scene.mediaAssetId)) continue
    const media = await findMediaAssetDetail(scene.mediaAssetId)
    if (!media || media.workspaceId !== input.cut.workspaceId) {
      throw new Error(`Source media unavailable for scene ${scene.id}`)
    }
    mediaById.set(media.id, media)
  }

  const xml = buildPremiereXmeml({
    cut: input.cut,
    scenes: input.scenes.map((scene) => {
      const media = mediaById.get(scene.mediaAssetId)!
      return {
        id: scene.id,
        mediaAssetId: scene.mediaAssetId,
        startMs: scene.startMs,
        endMs: scene.endMs,
        originalFilename: media.originalFilename,
        mediaDurationMs: media.durationMs,
      }
    }),
  })

  const outputPath = join(tmpdir(), `videon-export-${input.exportId}.xml`)
  try {
    await writeFile(outputPath, xml, 'utf8')
    const store = new S3ObjectStore()
    const storageKey = cutExportStorageKey(
      input.cut.workspaceId,
      input.cut.id,
      input.exportId,
      'premiere_xml',
    )
    const bytes = await store.uploadFileFromPath({
      workspaceId: input.cut.workspaceId,
      storageKey,
      filePath: outputPath,
      mimeType: 'application/xml',
    })
    await markCutExportSucceeded({ exportId: input.exportId, storageKey, bytes })
  } finally {
    await unlink(outputPath).catch(() => {})
  }
}

export async function runCutExport(exportId: string): Promise<void> {
  const exportJob = await findCutExport(exportId)
  if (!exportJob) throw new Error('Cut export not found')
  if (exportJob.status === 'succeeded' || exportJob.status === 'cancelled') return

  const cut = await findCut(exportJob.cutId)
  if (!cut || cut.workspaceId !== exportJob.workspaceId) {
    await markCutExportFailed(exportId, 'Cut not found for export')
    return
  }

  const scenes = await listScenesForCut(cut.id)
  if (scenes.length === 0) {
    await markCutExportFailed(exportId, 'Cut has no scenes to export')
    return
  }

  await markCutExportRunning(exportId)

  if (exportJob.format === 'premiere_xml') {
    try {
      await runPremiereXmlExport({ exportId, cut, scenes })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cut export failed'
      await markCutExportFailed(exportId, message)
      throw error
    }
    return
  }

  const store = new S3ObjectStore()
  const sourceCache = new Map<string, string>()
  const mediaById = new Map<string, MediaAssetDetail>()
  let segmentPaths: string[] = []
  const outputPath = join(tmpdir(), `videon-export-${exportId}.mp4`)

  try {
    for (const scene of scenes) {
      if (sourceCache.has(scene.mediaAssetId)) continue
      const media = await findMediaAssetDetail(scene.mediaAssetId)
      if (!media || media.workspaceId !== cut.workspaceId) {
        throw new Error(`Source media unavailable for scene ${scene.id}`)
      }
      mediaById.set(media.id, media)
      const sourcePath = join(tmpdir(), `videon-export-source-${scene.mediaAssetId}-${randomUUID()}`)
      await store.downloadObjectToFile({
        workspaceId: media.workspaceId,
        storageKey: media.storageKey,
        destinationPath: sourcePath,
      })
      sourceCache.set(scene.mediaAssetId, sourcePath)
    }

    const normalize = cutExportNeedsNormalize(cut, scenes, mediaById)
    segmentPaths = await buildSegments({ scenes, sourceCache, reencode: normalize, cut })

    try {
      await concatSegments(segmentPaths, outputPath, normalize)
    } catch (error) {
      if (normalize) throw error
      for (const path of segmentPaths) await unlink(path).catch(() => {})
      segmentPaths = await buildSegments({ scenes, sourceCache, reencode: true, cut })
      await concatSegments(segmentPaths, outputPath, true)
    }

    const storageKey = cutExportStorageKey(cut.workspaceId, cut.id, exportId, 'mp4')
    const bytes = await store.uploadFileFromPath({
      workspaceId: cut.workspaceId,
      storageKey,
      filePath: outputPath,
      mimeType: 'video/mp4',
    })
    await markCutExportSucceeded({ exportId, storageKey, bytes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cut export failed'
    await markCutExportFailed(exportId, message)
    throw error
  } finally {
    await unlink(outputPath).catch(() => {})
    for (const path of segmentPaths) await unlink(path).catch(() => {})
    for (const path of sourceCache.values()) await unlink(path).catch(() => {})
  }
}

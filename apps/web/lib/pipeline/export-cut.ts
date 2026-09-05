import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { findCut, listScenesForCut } from '@/lib/db/cuts'
import {
  findCutExport,
  markCutExportFailed,
  markCutExportRunning,
  markCutExportSucceeded,
} from '@/lib/db/cut-exports'
import { findMediaAsset } from '@/lib/db/media'
import { cutExportStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const execFileAsync = promisify(execFile)

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

async function extractSegment(input: {
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

async function concatSegments(segmentPaths: string[], destinationPath: string): Promise<void> {
  const listPath = join(tmpdir(), `videon-export-list-${randomUUID()}.txt`)
  const listBody = segmentPaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(listPath, listBody, 'utf8')
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        listPath,
        '-c',
        'copy',
        '-y',
        destinationPath,
      ],
      { maxBuffer: 8 * 1024 * 1024 },
    )
  } finally {
    await unlink(listPath).catch(() => {})
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
  const store = new S3ObjectStore()
  const sourceCache = new Map<string, string>()
  const segmentPaths: string[] = []
  const outputPath = join(tmpdir(), `videon-export-${exportId}.mp4`)

  try {
    for (const scene of scenes) {
      let sourcePath = sourceCache.get(scene.mediaAssetId)
      if (!sourcePath) {
        const media = await findMediaAsset(scene.mediaAssetId)
        if (!media || media.workspaceId !== cut.workspaceId) {
          throw new Error(`Source media unavailable for scene ${scene.id}`)
        }
        sourcePath = join(tmpdir(), `videon-export-source-${scene.mediaAssetId}-${randomUUID()}`)
        await store.downloadObjectToFile({
          workspaceId: media.workspaceId,
          storageKey: media.storageKey,
          destinationPath: sourcePath,
        })
        sourceCache.set(scene.mediaAssetId, sourcePath)
      }

      const segmentPath = join(tmpdir(), `videon-export-segment-${scene.id}-${randomUUID()}.mp4`)
      await extractSegment({
        sourcePath,
        startMs: scene.startMs,
        endMs: scene.endMs,
        destinationPath: segmentPath,
      })
      segmentPaths.push(segmentPath)
    }

    await concatSegments(segmentPaths, outputPath)
    const storageKey = cutExportStorageKey(cut.workspaceId, cut.id, exportId)
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

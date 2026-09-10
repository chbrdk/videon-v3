import { execFile } from 'node:child_process'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { findCut, listScenesForCut, type Cut, type CutScene } from '@/lib/db/cuts'
import { listCutAudioClips, listCutTracks, type CutAudioClip } from '@/lib/db/cut-audio'
import { listCutVideoClips } from '@/lib/db/cut-video'
import {
  findCutExport,
  markCutExportFailed,
  markCutExportRunning,
  markCutExportSucceeded,
} from '@/lib/db/cut-exports'
import { findMediaAssetDetail, type MediaAssetDetail } from '@/lib/db/media'
import { buildProgramExportSlices, busClipsEndMs } from '@/lib/cut-export-program'
import { buildPremiereXmeml, assignPremiereZipMediaNames, premierePackageReadme, sanitizePremiereXmlFilename } from '@/lib/pipeline/export-premiere-xml'
import { safeUnlink, writePremiereExportZip } from '@/lib/pipeline/export-premiere-zip'
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

async function extractBlackSegment(input: {
  durationMs: number
  destinationPath: string
  width: number
  height: number
  frameRate: number
}): Promise<void> {
  const fps = Number.isFinite(input.frameRate) && input.frameRate > 0 ? input.frameRate : 25
  const w = input.width > 0 ? input.width : 1280
  const h = input.height > 0 ? input.height : 720
  const durationSec = Math.max(input.durationMs / 1000, 0.04)
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=black:s=${w}x${h}:r=${fps}`,
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=48000:cl=stereo',
      '-t',
      durationSec.toFixed(3),
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
      '-shortest',
      '-movflags',
      '+faststart',
      '-y',
      input.destinationPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )
}

async function buildSegments(input: {
  scenes: CutScene[]
  sourceCache: Map<string, string>
  reencode: boolean
  cut: Cut
  v2Clips?: Array<{
    id: string
    mediaAssetId: string
    position: number
    timelineStartMs: number
    startMs: number
    endMs: number
  }>
  v2Muted?: boolean
  busEndMs?: number
}): Promise<string[]> {
  const segmentPaths: string[] = []
  const width = input.cut.width && input.cut.width > 0 ? input.cut.width : 1280
  const height = input.cut.height && input.cut.height > 0 ? input.cut.height : 720
  const frameRate = input.cut.frameRate && input.cut.frameRate > 0 ? input.cut.frameRate : 25

  const slices = buildProgramExportSlices(
    input.scenes.map((scene) => ({
      id: scene.id,
      position: scene.position,
      mediaAssetId: scene.mediaAssetId,
      startMs: scene.startMs,
      endMs: scene.endMs,
      timelineStartMs: scene.timelineStartMs ?? 0,
    })),
    {
      v2Clips: input.v2Clips ?? [],
      v2Muted: input.v2Muted,
      busEndMs: input.busEndMs,
    },
  )

  const needsPadOrOverlap =
    slices.some((slice) => slice.kind === 'black') ||
    Boolean(input.v2Clips?.length) ||
    slices.length !== input.scenes.length
  const forceReencode = input.reencode || needsPadOrOverlap

  for (const slice of slices) {
    const segmentPath = join(tmpdir(), `videon-export-segment-${randomUUID()}.mp4`)
    if (slice.kind === 'black') {
      await extractBlackSegment({
        durationMs: slice.durationMs,
        destinationPath: segmentPath,
        width,
        height,
        frameRate,
      })
      segmentPaths.push(segmentPath)
      continue
    }
    const sourcePath = input.sourceCache.get(slice.mediaAssetId)
    if (!sourcePath) throw new Error(`Source media unavailable for scene ${slice.sceneId}`)
    if (forceReencode) {
      await extractSegmentReencode({
        sourcePath,
        startMs: slice.startMs,
        endMs: slice.endMs,
        destinationPath: segmentPath,
        width,
        height,
        frameRate,
      })
    } else {
      await extractSegmentCopy({
        sourcePath,
        startMs: slice.startMs,
        endMs: slice.endMs,
        destinationPath: segmentPath,
      })
    }
    segmentPaths.push(segmentPath)
  }
  return segmentPaths
}

/** Mix unmuted bus clips onto program MP4 (adelay + amix). */
export async function mixBusAudioIntoProgram(input: {
  programPath: string
  destinationPath: string
  clips: CutAudioClip[]
  sourceCache: Map<string, string>
}): Promise<void> {
  if (input.clips.length === 0) {
    await execFileAsync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input.programPath, '-c', 'copy', '-y', input.destinationPath], {
      maxBuffer: 16 * 1024 * 1024,
    })
    return
  }

  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-i', input.programPath]
  const filterParts: string[] = []
  const mixInputs: string[] = ['[0:a]']

  for (const [index, clip] of input.clips.entries()) {
    const sourcePath = input.sourceCache.get(clip.mediaAssetId)
    if (!sourcePath) throw new Error(`Bus media unavailable for clip ${clip.id}`)
    args.push('-ss', seconds(clip.startMs), '-t', seconds(clip.endMs - clip.startMs), '-i', sourcePath)
    const label = `b${index}`
    const delay = Math.max(0, clip.timelineStartMs)
    filterParts.push(`[${index + 1}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,adelay=${delay}|${delay}[${label}]`)
    mixInputs.push(`[${label}]`)
  }

  const mixCount = mixInputs.length
  filterParts.push(
    `${mixInputs.join('')}amix=inputs=${mixCount}:duration=first:dropout_transition=0:normalize=0[aout]`,
  )

  args.push(
    '-filter_complex',
    filterParts.join(';'),
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    '-y',
    input.destinationPath,
  )

  await execFileAsync('ffmpeg', args, { maxBuffer: 32 * 1024 * 1024 })
}

async function runPremiereXmlExport(input: {
  exportId: string
  cut: Cut
  scenes: CutScene[]
}): Promise<void> {
  const store = new S3ObjectStore()
  const mediaById = new Map<string, MediaAssetDetail>()
  const sourceCache = new Map<string, string>()
  const zipPath = join(tmpdir(), `videon-export-${input.exportId}.zip`)
  const tracks = await listCutTracks(input.cut.id)
  const audioClips = await listCutAudioClips(input.cut.id)
  const videoClipsAll = await listCutVideoClips(input.cut.id)
  const unmutedTrackIds = new Set(tracks.filter((track) => !track.muted).map((track) => track.id))
  const busClips = audioClips.filter((clip) => unmutedTrackIds.has(clip.trackId))
  const overlayClips = videoClipsAll.filter((clip) => unmutedTrackIds.has(clip.trackId))

  try {
    for (const scene of input.scenes) {
      if (mediaById.has(scene.mediaAssetId)) continue
      const media = await findMediaAssetDetail(scene.mediaAssetId)
      if (!media || media.workspaceId !== input.cut.workspaceId) {
        throw new Error(`Source media unavailable for scene ${scene.id}`)
      }
      mediaById.set(media.id, media)
      const sourcePath = join(tmpdir(), `videon-premiere-source-${media.id}-${randomUUID()}`)
      await store.downloadObjectToFile({
        workspaceId: media.workspaceId,
        storageKey: media.storageKey,
        destinationPath: sourcePath,
      })
      sourceCache.set(media.id, sourcePath)
    }

    for (const clip of [...busClips, ...overlayClips]) {
      if (mediaById.has(clip.mediaAssetId)) continue
      const media = await findMediaAssetDetail(clip.mediaAssetId)
      if (!media || media.workspaceId !== input.cut.workspaceId) {
        throw new Error(`Track media unavailable for clip ${clip.id}`)
      }
      mediaById.set(media.id, media)
      const sourcePath = join(tmpdir(), `videon-premiere-source-${media.id}-${randomUUID()}`)
      await store.downloadObjectToFile({
        workspaceId: media.workspaceId,
        storageKey: media.storageKey,
        destinationPath: sourcePath,
      })
      sourceCache.set(media.id, sourcePath)
    }

    const zipNames = assignPremiereZipMediaNames(
      [...mediaById.values()].map((media) => ({
        mediaAssetId: media.id,
        originalFilename: media.originalFilename,
      })),
    )

    const xmlFilename = sanitizePremiereXmlFilename(input.cut.name)
    const xml = buildPremiereXmeml({
      cut: input.cut,
      scenes: input.scenes.map((scene) => {
        const media = mediaById.get(scene.mediaAssetId)!
        return {
          id: scene.id,
          mediaAssetId: scene.mediaAssetId,
          startMs: scene.startMs,
          endMs: scene.endMs,
          timelineStartMs: scene.timelineStartMs ?? 0,
          originalFilename: media.originalFilename,
          zipMediaName: zipNames.get(scene.mediaAssetId),
          mediaDurationMs: media.durationMs,
        }
      }),
      overlayClips: overlayClips.map((clip) => {
        const media = mediaById.get(clip.mediaAssetId)!
        return {
          id: clip.id,
          mediaAssetId: clip.mediaAssetId,
          timelineStartMs: clip.timelineStartMs,
          startMs: clip.startMs,
          endMs: clip.endMs,
          originalFilename: media.originalFilename,
          zipMediaName: zipNames.get(clip.mediaAssetId),
        }
      }),
      busClips: busClips.map((clip) => {
        const media = mediaById.get(clip.mediaAssetId)!
        return {
          id: clip.id,
          mediaAssetId: clip.mediaAssetId,
          timelineStartMs: clip.timelineStartMs,
          startMs: clip.startMs,
          endMs: clip.endMs,
          originalFilename: media.originalFilename,
          zipMediaName: zipNames.get(clip.mediaAssetId),
        }
      }),
    })

    const mediaFiles = [...mediaById.values()].map((media) => ({
      absolutePath: sourceCache.get(media.id)!,
      zipMediaName: zipNames.get(media.id)!,
    }))

    await writePremiereExportZip({
      zipPath,
      xmlFilename,
      xmlContent: xml,
      readmeContent: premierePackageReadme(input.cut.name || 'Cut', xmlFilename),
      mediaFiles,
    })

    const storageKey = cutExportStorageKey(
      input.cut.workspaceId,
      input.cut.id,
      input.exportId,
      'premiere_xml',
    )
    const bytes = await store.uploadFileFromPath({
      workspaceId: input.cut.workspaceId,
      storageKey,
      filePath: zipPath,
      mimeType: 'application/zip',
    })
    await markCutExportSucceeded({ exportId: input.exportId, storageKey, bytes })
  } finally {
    await safeUnlink(zipPath)
    for (const path of sourceCache.values()) await safeUnlink(path)
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
  const programPath = join(tmpdir(), `videon-export-${exportId}-program.mp4`)
  const outputPath = join(tmpdir(), `videon-export-${exportId}.mp4`)
  const tracks = await listCutTracks(cut.id)
  const audioClipsAll = await listCutAudioClips(cut.id)
  const videoClipsAll = await listCutVideoClips(cut.id)
  const unmutedTrackIds = new Set(tracks.filter((track) => !track.muted).map((track) => track.id))
  const busClips = audioClipsAll.filter((clip) => unmutedTrackIds.has(clip.trackId))
  const overlayClips = videoClipsAll.filter((clip) => unmutedTrackIds.has(clip.trackId))
  const v2Muted = !tracks.some((track) => track.kind === 'video_overlay' && !track.muted)

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

    for (const clip of [...busClips, ...overlayClips]) {
      if (sourceCache.has(clip.mediaAssetId)) continue
      const media = await findMediaAssetDetail(clip.mediaAssetId)
      if (!media || media.workspaceId !== cut.workspaceId) {
        throw new Error(`Track media unavailable for clip ${clip.id}`)
      }
      mediaById.set(media.id, media)
      const sourcePath = join(tmpdir(), `videon-export-source-${clip.mediaAssetId}-${randomUUID()}`)
      await store.downloadObjectToFile({
        workspaceId: media.workspaceId,
        storageKey: media.storageKey,
        destinationPath: sourcePath,
      })
      sourceCache.set(clip.mediaAssetId, sourcePath)
    }

    const normalize = cutExportNeedsNormalize(cut, scenes, mediaById) || overlayClips.length > 0
    const busEndMs = busClipsEndMs(busClips)
    const segmentInput = {
      scenes,
      sourceCache,
      cut,
      v2Clips: overlayClips.map((clip) => ({
        id: clip.id,
        mediaAssetId: clip.mediaAssetId,
        position: clip.position,
        timelineStartMs: clip.timelineStartMs,
        startMs: clip.startMs,
        endMs: clip.endMs,
      })),
      v2Muted,
      busEndMs,
    }
    segmentPaths = await buildSegments({ ...segmentInput, reencode: normalize })

    try {
      await concatSegments(segmentPaths, programPath, normalize)
    } catch (error) {
      if (normalize) throw error
      for (const path of segmentPaths) await unlink(path).catch(() => {})
      segmentPaths = await buildSegments({ ...segmentInput, reencode: true })
      await concatSegments(segmentPaths, programPath, true)
    }

    if (busClips.length > 0) {
      await mixBusAudioIntoProgram({
        programPath,
        destinationPath: outputPath,
        clips: busClips,
        sourceCache,
      })
    } else {
      await execFileAsync(
        'ffmpeg',
        ['-hide_banner', '-loglevel', 'error', '-i', programPath, '-c', 'copy', '-y', outputPath],
        { maxBuffer: 16 * 1024 * 1024 },
      )
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
    await unlink(programPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
    for (const path of segmentPaths) await unlink(path).catch(() => {})
    for (const path of sourceCache.values()) await unlink(path).catch(() => {})
  }
}

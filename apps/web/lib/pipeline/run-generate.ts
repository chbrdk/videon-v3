import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { unlink, writeFile, stat, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  findMediaGenerationJob,
  insertMediaAssetLineage,
  markMediaGenerationDraftReady,
  markMediaGenerationFailed,
  markMediaGenerationProgress,
  markMediaGenerationRunning,
  markMediaGenerationSucceeded,
} from '@/lib/db/media-generation'
import { createUploadingMediaAsset, findMediaAsset, findMediaAssetDetail } from '@/lib/db/media'
import { markMediaReady } from '@/lib/db/media-lifecycle'
import { findWorkspaceById } from '@/lib/db/workspaces'
import {
  downloadUrlToFile,
  GenerationGatewayError,
  runOpenRouterVideoCreate,
  runOpenRouterVideoEdit,
} from '@/lib/generation/openrouter-video-client'
import {
  buildQualityLockedPrompt,
  resolveCreateModel,
  resolveDraftModel,
  resolveEditModel,
} from '@/lib/generation/model-catalog'
import {
  editInputMinMsForModel,
  expandEditRangeForProvider,
} from '@/lib/generation/expand-edit-range'
import { scheduleMediaAnalysis } from '@/lib/pipeline/enqueue'
import { appendPromotedGenerationToCut } from '@/lib/pipeline/append-promoted-to-cut'
import {
  mediaGenerationCreateStorageKey,
  mediaGenerationStorageKey,
  mediaSourceStorageKey,
} from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const execFileAsync = promisify(execFile)

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(3)
}

async function extractSlice(input: {
  sourcePath: string
  startMs: number
  endMs: number
  destinationPath: string
}): Promise<void> {
  const durationSec = Math.max(0.1, (input.endMs - input.startMs) / 1000).toFixed(3)
  // Re-encode with -t so provider-facing clips hit the requested length
  // (stream-copy often undershoots on keyframe boundaries and Seedance needs ≥4s).
  await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      seconds(input.startMs),
      '-i',
      input.sourcePath,
      '-t',
      durationSec,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      '-y',
      input.destinationPath,
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { maxBuffer: 1024 * 1024 },
    )
    const n = Number.parseFloat(stdout.trim())
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

async function muxSourceAudio(input: {
  videoPath: string
  audioSourcePath: string
  destinationPath: string
}): Promise<void> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        input.videoPath,
        '-i',
        input.audioSourcePath,
        '-map',
        '0:v:0',
        '-map',
        '1:a:0?',
        '-c:v',
        'copy',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        input.destinationPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    )
  } catch {
    await copyFile(input.videoPath, input.destinationPath)
  }
}

async function sha256File(filePath: string): Promise<string> {
  const { createReadStream } = await import('node:fs')
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

async function promoteFinalToMediaAsset(input: {
  jobId: string
  workspaceId: string
  parentMediaId: string | null
  plexonUserId: string
  finalPath: string
  modelId: string
  prompt: string
  lockPackHash: string | null
  startMs: number | null
  endMs: number | null
  filenameHint?: string
}): Promise<{ mediaAssetId: string; bytes: number }> {
  const workspace = await findWorkspaceById(input.workspaceId)
  if (!workspace) throw new Error('Workspace not found for promote')

  const bytes = (await stat(input.finalPath)).size
  const contentHash = await sha256File(input.finalPath)
  const checksum = createHash('sha256').update(`${contentHash}:${input.jobId}`).digest('hex')
  const mediaAssetId = randomUUID()
  const storageKey = mediaSourceStorageKey(input.workspaceId, mediaAssetId)
  const store = new S3ObjectStore()
  await store.uploadFileFromPath({
    workspaceId: input.workspaceId,
    storageKey,
    mimeType: 'video/mp4',
    filePath: input.finalPath,
  })

  const parent = input.parentMediaId ? await findMediaAsset(input.parentMediaId) : null
  const filenameBase =
    input.filenameHint ||
    parent?.originalFilename?.replace(/\.[^.]+$/, '') ||
    'ai-clip'
  await createUploadingMediaAsset({
    id: mediaAssetId,
    workspace,
    plexonUserId: input.plexonUserId,
    originalFilename: `${filenameBase}.mp4`,
    mimeType: 'video/mp4',
    bytes,
    checksumSha256: checksum,
    storageKey,
  })
  await markMediaReady(mediaAssetId, input.workspaceId)
  await insertMediaAssetLineage({
    mediaAssetId,
    workspaceId: input.workspaceId,
    sourceMediaAssetId: input.parentMediaId,
    sourceStartMs: input.startMs,
    sourceEndMs: input.endMs,
    generationJobId: input.jobId,
    modelId: input.modelId,
    prompt: input.prompt,
    lockPackHash: input.lockPackHash,
  })
  try {
    await scheduleMediaAnalysis({
      mediaAssetId,
      workspaceId: input.workspaceId,
      requestedByPlexonUserId: input.plexonUserId,
      checksumSha256: checksum,
    })
  } catch (error) {
    console.error(
      '[VIDEON-v3] Post-promote analysis schedule failed',
      JSON.stringify({
        mediaAssetId,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }
  return { mediaAssetId, bytes }
}

async function maybeInsertTargetCut(input: {
  job: {
    id: string
    workspaceId: string
    targetCutId: string | null
    targetCutInsertedAt: string | null
    startMs: number | null
    endMs: number | null
    durationSeconds: number | null
  }
  promotedMediaAssetId: string
}): Promise<void> {
  const { job, promotedMediaAssetId } = input
  if (!job.targetCutId || job.targetCutInsertedAt) return
  const fallbackDurationMs =
    job.startMs != null && job.endMs != null
      ? Math.max(1000, job.endMs - job.startMs)
      : (job.durationSeconds ?? 5) * 1000
  try {
    const result = await appendPromotedGenerationToCut({
      cutId: job.targetCutId,
      workspaceId: job.workspaceId,
      promotedMediaAssetId,
      fallbackDurationMs,
      jobId: job.id,
      markInserted: true,
    })
    if ('error' in result) {
      console.error(
        '[VIDEON-v3] Post-promote cut insert failed',
        JSON.stringify({ jobId: job.id, message: result.error }),
      )
    }
  } catch (error) {
    console.error(
      '[VIDEON-v3] Post-promote cut insert failed',
      JSON.stringify({
        jobId: job.id,
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}

export async function runMediaGenerate(jobId: string): Promise<void> {
  const job = await findMediaGenerationJob(jobId)
  if (!job) throw new Error(`Generation job ${jobId} not found`)
  if (job.status === 'succeeded') return
  if (job.status === 'draft_ready' && job.lane === 'draft') return

  if (job.intent === 'create') {
    await runMediaGenerateCreate(jobId, job)
    return
  }

  if (job.startMs == null || job.endMs == null || !job.mediaAssetId) {
    await markMediaGenerationFailed(jobId, 'Edit job missing mediaAssetId/startMs/endMs')
    return
  }

  await markMediaGenerationRunning(jobId)
  await markMediaGenerationProgress(jobId, 5)

  const media = await findMediaAssetDetail(job.mediaAssetId)
  if (!media || media.workspaceId !== job.workspaceId) {
    await markMediaGenerationFailed(jobId, 'Media asset not found')
    return
  }

  const store = new S3ObjectStore()
  const sourcePath = join(tmpdir(), `videon-gen-src-${randomUUID()}.mp4`)
  const slicePath = join(tmpdir(), `videon-gen-slice-${randomUUID()}.mp4`)
  const providerPath = join(tmpdir(), `videon-gen-provider-${randomUUID()}.mp4`)
  const outPath = join(tmpdir(), `videon-gen-out-${randomUUID()}.mp4`)

  try {
    await store.downloadObjectToFile({
      workspaceId: job.workspaceId,
      storageKey: media.storageKey,
      destinationPath: sourcePath,
    })
    await markMediaGenerationProgress(jobId, 15)

    const isDraftLane = job.lane === 'draft'
    const model = isDraftLane
      ? resolveDraftModel(job.modelId === 'happy_horse_draft' ? job.modelId : null)
      : resolveEditModel(job.modelId)
    if (!model) {
      await markMediaGenerationFailed(jobId, `Unknown or disabled model: ${job.modelId}`)
      return
    }

    // Seedance r2v rejects input clips < ~1.8s — expand within source media.
    const sliceRange = expandEditRangeForProvider({
      startMs: job.startMs,
      endMs: job.endMs,
      mediaDurationMs: media.durationMs,
      minInputMs: editInputMinMsForModel(model.id),
    })
    if (sliceRange.insufficient) {
      await markMediaGenerationFailed(
        jobId,
        `Source clip too short for ${model.label}: need ≥${Math.ceil(editInputMinMsForModel(model.id) / 1000)}s of source video (Seedance r2v floor).`,
      )
      return
    }
    if (sliceRange.expanded) {
      console.info(
        '[VIDEON-v3] Expanded edit slice for provider floor',
        JSON.stringify({
          jobId,
          selected: { startMs: job.startMs, endMs: job.endMs },
          slice: { startMs: sliceRange.startMs, endMs: sliceRange.endMs },
          modelId: model.id,
        }),
      )
    }

    await extractSlice({
      sourcePath,
      startMs: sliceRange.startMs,
      endMs: sliceRange.endMs,
      destinationPath: slicePath,
    })
    const probedSeconds = await probeDurationSeconds(slicePath)
    const minInputSeconds = Math.ceil(editInputMinMsForModel(model.id) / 1000)
    if (probedSeconds != null && probedSeconds + 0.05 < minInputSeconds) {
      await markMediaGenerationFailed(
        jobId,
        `Prepared source clip is ${probedSeconds.toFixed(2)}s; ${model.label} needs ≥${minInputSeconds}s.`,
      )
      return
    }
    await markMediaGenerationProgress(jobId, 25)

    const sliceKey = mediaGenerationStorageKey(job.workspaceId, job.mediaAssetId, job.id, 'slice')
    await store.uploadFileFromPath({
      workspaceId: job.workspaceId,
      storageKey: sliceKey,
      mimeType: 'video/mp4',
      filePath: slicePath,
    })

    const signed = await store.createSignedGetUrl({
      workspaceId: job.workspaceId,
      storageKey: sliceKey,
      expiresInSeconds: 4 * 60 * 60,
    })

    const lockedPrompt = buildQualityLockedPrompt(job.prompt)
    const durationSeconds = Math.max(
      minInputSeconds,
      Math.round(probedSeconds ?? (sliceRange.endMs - sliceRange.startMs) / 1000),
    )
    const providerResult = await runOpenRouterVideoEdit({
      model: model.providerModelId,
      prompt: lockedPrompt,
      videoUrl: signed,
      imageUrls: job.referenceImageUrls,
      resolution: isDraftLane ? '480p' : model.defaultResolution,
      // Match input length with a concrete duration (OpenRouter rejects -1).
      matchInputDuration: true,
      durationSeconds,
      durationMinSeconds: model.durationMinSeconds,
      durationMaxSeconds: model.durationMaxSeconds,
      seed: job.seed,
      generateAudio: !job.keepSourceAudio,
      onProgress: async (percent) => {
        await markMediaGenerationProgress(jobId, Math.min(80, Math.max(30, percent)))
      },
    })

    await downloadUrlToFile(providerResult.videoUrl, providerPath)
    await markMediaGenerationProgress(jobId, 85)

    if (job.keepSourceAudio) {
      await muxSourceAudio({
        videoPath: providerPath,
        audioSourcePath: slicePath,
        destinationPath: outPath,
      })
    } else {
      await copyFile(providerPath, outPath)
    }

    const outBytes = (await stat(outPath)).size
    if (isDraftLane) {
      const draftKey = mediaGenerationStorageKey(job.workspaceId, job.mediaAssetId, job.id, 'draft')
      await store.uploadFileFromPath({
        workspaceId: job.workspaceId,
        storageKey: draftKey,
        mimeType: 'video/mp4',
        filePath: outPath,
      })
      await markMediaGenerationDraftReady({
        jobId,
        sliceStorageKey: sliceKey,
        draftStorageKey: draftKey,
        draftBytes: outBytes,
        providerRequestId: providerResult.requestId,
      })
      try {
        const { reportUsage } = await import('../usage-report')
        if (job.requestedByPlexonUserId) {
          reportUsage({
            userId: job.requestedByPlexonUserId,
            eventType: 'video_generation',
            rawUnits: {
              runs: 1,
              model: job.modelId,
              surface: 'videon.generate.draft',
              provider_request_id: providerResult.requestId,
              duration_ms: Math.max(0, job.endMs - job.startMs),
            },
            idempotencyKey: `video_gen:${jobId}`,
          })
        }
      } catch {
        /* never affect generation */
      }
      return
    }

    const finalKey = mediaGenerationStorageKey(job.workspaceId, job.mediaAssetId, job.id, 'final')
    await store.uploadFileFromPath({
      workspaceId: job.workspaceId,
      storageKey: finalKey,
      mimeType: 'video/mp4',
      filePath: outPath,
    })
    await markMediaGenerationProgress(jobId, 92)

    const promoted = await promoteFinalToMediaAsset({
      jobId,
      workspaceId: job.workspaceId,
      parentMediaId: job.mediaAssetId,
      plexonUserId: job.requestedByPlexonUserId,
      finalPath: outPath,
      modelId: job.modelId,
      prompt: job.prompt,
      lockPackHash: job.lockPackHash,
      startMs: job.startMs,
      endMs: job.endMs,
      filenameHint: `${media.originalFilename.replace(/\.[^.]+$/, '')}-ai-edit`,
    })

    await markMediaGenerationSucceeded({
      jobId,
      sliceStorageKey: sliceKey,
      finalStorageKey: finalKey,
      finalBytes: promoted.bytes,
      promotedMediaAssetId: promoted.mediaAssetId,
      providerRequestId: providerResult.requestId,
    })
    try {
      const { reportUsage } = await import('../usage-report')
      if (job.requestedByPlexonUserId) {
        reportUsage({
          userId: job.requestedByPlexonUserId,
          eventType: 'video_generation',
          rawUnits: {
            runs: 1,
            model: job.modelId,
            surface: 'videon.generate',
            provider_request_id: providerResult.requestId,
            duration_ms: Math.max(0, job.endMs - job.startMs),
          },
          idempotencyKey: `video_gen:${jobId}`,
        })
      }
    } catch {
      /* never affect generation */
    }
    await maybeInsertTargetCut({ job, promotedMediaAssetId: promoted.mediaAssetId })
  } catch (error) {
    const message =
      error instanceof GenerationGatewayError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error)
    await markMediaGenerationFailed(jobId, message)
    throw error
  } finally {
    await unlink(sourcePath).catch(() => {})
    await unlink(slicePath).catch(() => {})
    await unlink(providerPath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}

async function runMediaGenerateCreate(
  jobId: string,
  job: Awaited<ReturnType<typeof findMediaGenerationJob>>,
): Promise<void> {
  if (!job) return
  await markMediaGenerationRunning(jobId)
  await markMediaGenerationProgress(jobId, 10)

  const model = resolveCreateModel(job.modelId)
  if (!model) {
    await markMediaGenerationFailed(jobId, `Unknown or disabled create model: ${job.modelId}`)
    return
  }

  const store = new S3ObjectStore()
  const providerPath = join(tmpdir(), `videon-gen-create-${randomUUID()}.mp4`)

  try {
    const providerResult = await runOpenRouterVideoCreate({
      model: model.providerModelId,
      prompt: job.prompt.trim(),
      imageUrls: job.referenceImageUrls,
      resolution: model.defaultResolution,
      durationSeconds: job.durationSeconds ?? 5,
      durationMinSeconds: model.durationMinSeconds,
      durationMaxSeconds: model.durationMaxSeconds,
      aspectRatio: (job.aspectRatio as '16:9' | '9:16' | '1:1' | 'auto') || '16:9',
      seed: job.seed,
      generateAudio: true,
      onProgress: async (percent) => {
        await markMediaGenerationProgress(jobId, Math.min(85, Math.max(20, percent)))
      },
    })

    await downloadUrlToFile(providerResult.videoUrl, providerPath)
    await markMediaGenerationProgress(jobId, 90)

    const finalKey = mediaGenerationCreateStorageKey(job.workspaceId, job.id, 'final')
    await store.uploadFileFromPath({
      workspaceId: job.workspaceId,
      storageKey: finalKey,
      mimeType: 'video/mp4',
      filePath: providerPath,
    })

    const promoted = await promoteFinalToMediaAsset({
      jobId,
      workspaceId: job.workspaceId,
      parentMediaId: null,
      plexonUserId: job.requestedByPlexonUserId,
      finalPath: providerPath,
      modelId: job.modelId,
      prompt: job.prompt,
      lockPackHash: job.lockPackHash,
      startMs: null,
      endMs: null,
      filenameHint: `ai-create-${job.id.slice(0, 8)}`,
    })

    await markMediaGenerationSucceeded({
      jobId,
      sliceStorageKey: null,
      finalStorageKey: finalKey,
      finalBytes: promoted.bytes,
      promotedMediaAssetId: promoted.mediaAssetId,
      providerRequestId: providerResult.requestId,
    })
    await maybeInsertTargetCut({ job, promotedMediaAssetId: promoted.mediaAssetId })
  } catch (error) {
    const message =
      error instanceof GenerationGatewayError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error)
    await markMediaGenerationFailed(jobId, message)
    throw error
  } finally {
    await unlink(providerPath).catch(() => {})
  }
}

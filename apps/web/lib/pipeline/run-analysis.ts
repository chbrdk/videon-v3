import { createHash } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  findAnalysisRun,
  insertSceneInsight,
  markAnalysisFinished,
  markAnalysisRunning,
  upsertStageRun,
} from '@/lib/db/analysis'
import { findMediaAsset } from '@/lib/db/media'
import { markMediaFailed, markMediaProcessing, markMediaReady, updateMediaProbe } from '@/lib/db/media-lifecycle'
import { analyzeSceneWithOpenRouter, OpenRouterGatewayError } from '@/lib/openrouter-client'
import { defaultVisionLane, schemaFallbackVisionLane } from '@/lib/vision-policy'
import { PIPELINE_STAGES, type PipelineStageKey } from '@/lib/pipeline/constants'
import { detectScenes } from '@/lib/pipeline/scene-detect'
import { sampleSceneFrames } from '@/lib/pipeline/frame-sample'
import { probeMediaFile } from '@/lib/pipeline/ffprobe'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

function userPseudonym(workspaceId: string, plexonUserId: string): string {
  return createHash('sha256').update(`${workspaceId}:${plexonUserId}`).digest('hex').slice(0, 32)
}

async function runStage<T>(
  analysisRunId: string,
  stageKey: PipelineStageKey,
  inputFingerprint: string,
  progressTotal: number,
  fn: () => Promise<T>,
): Promise<T> {
  await upsertStageRun({
    analysisRunId,
    stageKey,
    inputFingerprint,
    status: 'running',
    progressCompleted: 0,
    progressTotal,
  })
  try {
    const result = await fn()
    await upsertStageRun({
      analysisRunId,
      stageKey,
      inputFingerprint,
      status: 'succeeded',
      progressCompleted: progressTotal,
      progressTotal,
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stage failed'
    await upsertStageRun({
      analysisRunId,
      stageKey,
      inputFingerprint,
      status: 'failed',
      progressCompleted: 0,
      progressTotal,
      errorCode: 'stage_failed',
      errorMessage: message,
    })
    throw error
  }
}

async function analyzeSceneWithFallback(input: Parameters<typeof analyzeSceneWithOpenRouter>[0]) {
  try {
    return await analyzeSceneWithOpenRouter(input, { lane: defaultVisionLane() })
  } catch (error) {
    if (error instanceof OpenRouterGatewayError && error.code === 'invalid_output') {
      return analyzeSceneWithOpenRouter(input, { lane: schemaFallbackVisionLane() })
    }
    throw error
  }
}

export async function runMediaAnalysis(analysisRunId: string): Promise<void> {
  const analysis = await findAnalysisRun(analysisRunId)
  if (!analysis) throw new Error('Analysis run not found')
  if (analysis.status === 'succeeded' || analysis.status === 'cancelled') return

  const media = await findMediaAsset(analysis.mediaAssetId)
  if (!media) throw new Error('Media asset not found')

  await markAnalysisRunning(analysisRunId)
  const fingerprint = analysis.inputFingerprint
  const tempPath = join(tmpdir(), `videon-source-${randomUUID()}`)
  const store = new S3ObjectStore()

  try {
    await runStage(analysisRunId, 'ingest', fingerprint, 1, async () => {
      await markMediaProcessing(media.id, media.workspaceId)
      return true
    })

    await store.downloadObjectToFile({
      workspaceId: media.workspaceId,
      storageKey: media.storageKey,
      destinationPath: tempPath,
    })

    const probe = await runStage(analysisRunId, 'probe', fingerprint, 1, async () => probeMediaFile(tempPath))
    await updateMediaProbe({
      mediaAssetId: media.id,
      workspaceId: media.workspaceId,
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      frameRate: probe.frameRate,
    })

    const scenes = await runStage(analysisRunId, 'scene_detect', fingerprint, 1, async () =>
      detectScenes(probe.durationMs),
    )

    const sceneFrames = await runStage(analysisRunId, 'frame_sample', fingerprint, scenes.length, async () => {
      const framesByScene = []
      for (const scene of scenes) {
        framesByScene.push({
          scene,
          frames: await sampleSceneFrames({
            sourcePath: tempPath,
            sceneKey: scene.key,
            startMs: scene.startMs,
            endMs: scene.endMs,
          }),
        })
      }
      return framesByScene
    })

    await runStage(analysisRunId, 'audio', fingerprint, 1, async () => {
      // Transcription is a later optional branch; keep the stage observable but skipped.
      return null
    })

    await runStage(analysisRunId, 'vision', fingerprint, sceneFrames.length, async () => {
      let completed = 0
      for (const entry of sceneFrames) {
        const result = await analyzeSceneWithFallback({
          locale: 'de',
          startMs: entry.scene.startMs,
          endMs: entry.scene.endMs,
          frames: entry.frames,
          userPseudonym: userPseudonym(media.workspaceId, analysis.requestedByPlexonUserId),
        })
        await insertSceneInsight({
          analysisRunId,
          sceneKey: entry.scene.key,
          startMs: entry.scene.startMs,
          endMs: entry.scene.endMs,
          frameRefs: entry.frames.map((frame) => ({ id: frame.id, timestampMs: frame.timestampMs })),
          insight: result.insight,
          requestedModel: result.provenance.requestedModel,
          actualModel: result.provenance.actualModel,
          provider: result.provenance.provider,
          openrouterRequestId: result.provenance.requestId,
          promptVersion: result.provenance.promptVersion,
          promptTokens: result.provenance.usage.promptTokens,
          completionTokens: result.provenance.usage.completionTokens,
          reasoningTokens: result.provenance.usage.reasoningTokens,
          cachedTokens: result.provenance.usage.cachedTokens,
          providerCostUsd: result.provenance.usage.costUsd,
        })
        completed += 1
        await upsertStageRun({
          analysisRunId,
          stageKey: 'vision',
          inputFingerprint: fingerprint,
          status: 'running',
          progressCompleted: completed,
          progressTotal: sceneFrames.length,
        })
      }
    })

    await runStage(analysisRunId, 'aggregate', fingerprint, 1, async () => true)
    await runStage(analysisRunId, 'index', fingerprint, 1, async () => true)

    await markMediaReady(media.id, media.workspaceId)
    await markAnalysisFinished(analysisRunId, 'succeeded')
  } catch (error) {
    await markMediaFailed(media.id, media.workspaceId).catch(() => {})
    await markAnalysisFinished(analysisRunId, 'failed')
    throw error
  } finally {
    await unlink(tempPath).catch(() => {})
  }
}

export function pipelineStageCount(): number {
  return PIPELINE_STAGES.length
}

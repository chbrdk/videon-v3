import { createHash } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  findAnalysisRun,
  insertSceneInsight,
  listSceneInsightsForAnalysis,
  markAnalysisFinished,
  markAnalysisRunning,
  upsertStageRun,
} from '@/lib/db/analysis'
import { findMediaAsset } from '@/lib/db/media'
import { markMediaFailed, markMediaProcessing, markMediaReady, updateMediaProbe } from '@/lib/db/media-lifecycle'
import { analyzeSceneWithOpenRouter, OpenRouterGatewayError } from '@/lib/openrouter-client'
import { defaultVisionLane, schemaFallbackVisionLane, strictSchemaFallbackVisionLane } from '@/lib/vision-policy'
import { PIPELINE_STAGES, type PipelineStageKey } from '@/lib/pipeline/constants'
import { detectScenesFromFile } from '@/lib/pipeline/scene-detect'
import { extractAudioTrack } from '@/lib/pipeline/audio-extract'
import { upsertMediaTranscript } from '@/lib/db/transcript'
import { replaceSearchEntriesForAnalysis } from '@/lib/db/search'
import { sampleSceneFrames } from '@/lib/pipeline/frame-sample'
import { probeMediaFile } from '@/lib/pipeline/ffprobe'
import { transcriptExcerptForScene, transcribeAudioFile, type TranscriptSegment } from '@/lib/pipeline/transcribe'
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
    if (
      error instanceof OpenRouterGatewayError &&
      (error.code === 'invalid_output' || (error.code === 'upstream' && error.retryable))
    ) {
      try {
        return await analyzeSceneWithOpenRouter(input, { lane: schemaFallbackVisionLane() })
      } catch (retryError) {
        const strictLane = strictSchemaFallbackVisionLane()
        if (
          strictLane &&
          retryError instanceof OpenRouterGatewayError &&
          (retryError.code === 'invalid_output' || (retryError.code === 'upstream' && retryError.retryable))
        ) {
          return analyzeSceneWithOpenRouter(input, { lane: strictLane })
        }
        throw retryError
      }
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
  const audioPath = join(tmpdir(), `videon-audio-${randomUUID()}.wav`)
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
      detectScenesFromFile(tempPath, probe.durationMs),
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

    let transcriptSegments: TranscriptSegment[] = []
    await runStage(analysisRunId, 'audio', fingerprint, 1, async () => {
      const extracted = await extractAudioTrack({ sourcePath: tempPath, destinationPath: audioPath })
      if (!extracted) {
        await upsertMediaTranscript({
          mediaAssetId: media.id,
          analysisRunId,
          status: 'skipped',
          transcriptText: null,
          segments: [],
        })
        return 'no_audio_track'
      }

      try {
        const transcript = await transcribeAudioFile(audioPath)
        if (!transcript) {
          await upsertMediaTranscript({
            mediaAssetId: media.id,
            analysisRunId,
            status: 'skipped',
            transcriptText: null,
            segments: [],
          })
          return 'transcription_disabled'
        }

        transcriptSegments = transcript.segments
        await upsertMediaTranscript({
          mediaAssetId: media.id,
          analysisRunId,
          status: 'ready',
          transcriptText: transcript.text,
          segments: transcript.segments,
        })
        return transcript.segments.length > 0 ? 'transcribed' : 'transcribed_empty'
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Transcription failed'
        await upsertMediaTranscript({
          mediaAssetId: media.id,
          analysisRunId,
          status: 'failed',
          transcriptText: null,
          segments: [],
        })
        return `transcription_failed:${message.slice(0, 240)}`
      }
    })

    await runStage(analysisRunId, 'vision', fingerprint, sceneFrames.length, async () => {
      let completed = 0
      for (const entry of sceneFrames) {
        const result = await analyzeSceneWithFallback({
          locale: 'de',
          startMs: entry.scene.startMs,
          endMs: entry.scene.endMs,
          frames: entry.frames,
          transcriptExcerpt: transcriptExcerptForScene(
            transcriptSegments,
            entry.scene.startMs,
            entry.scene.endMs,
          ),
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
    await runStage(analysisRunId, 'index', fingerprint, 1, async () => {
      const insights = await listSceneInsightsForAnalysis(analysisRunId)
      await replaceSearchEntriesForAnalysis({
        workspaceId: media.workspaceId,
        mediaAssetId: media.id,
        analysisRunId,
        mediaFilename: media.originalFilename,
        scenes: insights.map((entry) => ({
          sceneKey: entry.sceneKey,
          summary: entry.insight.summary,
          mood: entry.insight.mood,
          location: entry.insight.setting?.location,
        })),
      })
      return insights.length
    })

    await markMediaReady(media.id, media.workspaceId)
    await markAnalysisFinished(analysisRunId, 'succeeded')
  } catch (error) {
    await markMediaFailed(media.id, media.workspaceId).catch(() => {})
    await markAnalysisFinished(analysisRunId, 'failed')
    throw error
  } finally {
    await unlink(tempPath).catch(() => {})
    await unlink(audioPath).catch(() => {})
  }
}

export function pipelineStageCount(): number {
  return PIPELINE_STAGES.length
}

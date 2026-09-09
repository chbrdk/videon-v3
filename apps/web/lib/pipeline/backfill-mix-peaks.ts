import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { findMediaAsset } from '@/lib/db/media'
import { findLatestWaveformPeaksForMedia, upsertMediaWaveformPeaks } from '@/lib/db/media-waveform-peaks'
import { findLatestAnalysisForMedia } from '@/lib/db/analysis'
import { extractAudioTrack } from '@/lib/pipeline/audio-extract'
import { peaksFromMonoWavFile, WAVEFORM_PEAK_BUCKETS } from '@/lib/pipeline/wav-peaks'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

export type MixPeaksBackfillResult =
  | { status: 'ready'; skipped?: boolean; mixPeaks?: number[] }
  | { status: 'skipped'; reason: 'no_audio' | 'no_media' | 'uploading' }
  | { status: 'failed'; message: string }

/**
 * Compute mixPeaks for media missing Wave 3 storage — no vision/Demucs.
 * Spec: specs/api/media-peaks-backfill.md
 */
export async function backfillMixPeaksForMedia(mediaAssetId: string): Promise<MixPeaksBackfillResult> {
  const media = await findMediaAsset(mediaAssetId)
  if (!media) return { status: 'skipped', reason: 'no_media' }
  if (media.lifecycleState === 'uploading') return { status: 'skipped', reason: 'uploading' }

  const existing = await findLatestWaveformPeaksForMedia(mediaAssetId)
  if (existing?.peaks?.length) return { status: 'ready', skipped: true, mixPeaks: existing.peaks }

  const analysis = await findLatestAnalysisForMedia(mediaAssetId)
  const analysisRunId = analysis?.id ?? randomUUID()

  const store = new S3ObjectStore()
  const tempPath = join(tmpdir(), `videon-peaks-src-${randomUUID()}`)
  const audioPath = join(tmpdir(), `videon-peaks-audio-${randomUUID()}.wav`)
  try {
    await store.downloadObjectToFile({
      workspaceId: media.workspaceId,
      storageKey: media.storageKey,
      destinationPath: tempPath,
    })
    const extracted = await extractAudioTrack({ sourcePath: tempPath, destinationPath: audioPath })
    if (!extracted) return { status: 'skipped', reason: 'no_audio' }

    const mixPeaks = await peaksFromMonoWavFile(audioPath, WAVEFORM_PEAK_BUCKETS)
    if (mixPeaks.length === 0) return { status: 'skipped', reason: 'no_audio' }

    // If there is no analysis run row, still persist against a synthetic id only when analysis exists.
    if (!analysis) {
      return { status: 'failed', message: 'No analysis run to attach mixPeaks' }
    }

    await upsertMediaWaveformPeaks({
      mediaAssetId: media.id,
      analysisRunId,
      peaks: mixPeaks,
      buckets: WAVEFORM_PEAK_BUCKETS,
      method: 'ffmpeg_mono_wav_backfill',
    })
    return { status: 'ready', mixPeaks }
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : 'peaks backfill failed',
    }
  } finally {
    await unlink(tempPath).catch(() => {})
    await unlink(audioPath).catch(() => {})
  }
}

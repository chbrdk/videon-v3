import { execFile } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { upsertMediaAudioStem } from '@/lib/db/media-stems'
import { STEM_DEMUCS_CAPABILITY } from '@/lib/pipeline/constants'
import { resolveRepoScript } from '@/lib/repo-root'
import { mediaStemStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const execFileAsync = promisify(execFile)

export type StemMethod = 'ffmpeg_mid_side' | 'demucs'

type StemScriptResult = {
  method: string
  voicePath: string
  musicPath: string
  durationMs: number
  voicePeaks: number[]
  musicPeaks: number[]
}

export function resolveStemMethod(requestedCapabilities: string[] | null | undefined): StemMethod {
  if (requestedCapabilities?.includes(STEM_DEMUCS_CAPABILITY)) return 'demucs'
  return 'ffmpeg_mid_side'
}

export async function separateAndStoreAudioStems(input: {
  sourcePath: string
  workspaceId: string
  mediaAssetId: string
  analysisRunId: string
  store: S3ObjectStore
  method?: StemMethod
}): Promise<'stemmed' | 'stem_failed'> {
  const voicePath = join(tmpdir(), `videon-stem-voice-${randomUUID()}.wav`)
  const musicPath = join(tmpdir(), `videon-stem-music-${randomUUID()}.wav`)
  const method = input.method ?? 'ffmpeg_mid_side'
  try {
    const scriptPath = await resolveRepoScript('scripts/separate-audio-stems.py')
    const { stdout } = await execFileAsync(
      'python3',
      [
        scriptPath,
        input.sourcePath,
        voicePath,
        musicPath,
        '--buckets',
        '240',
        '--method',
        method,
      ],
      {
        maxBuffer: 8 * 1024 * 1024,
        timeout: method === 'demucs' ? 35 * 60 * 1000 : 10 * 60 * 1000,
      },
    )
    const parsed = JSON.parse(stdout) as StemScriptResult
    const recordedMethod = typeof parsed.method === 'string' ? parsed.method : method
    const durationMs = Number.isFinite(parsed.durationMs) ? Math.max(0, Math.floor(parsed.durationMs)) : null

    for (const stem of [
      {
        kind: 'voice' as const,
        path: parsed.voicePath || voicePath,
        peaks: Array.isArray(parsed.voicePeaks) ? parsed.voicePeaks : [],
      },
      {
        kind: 'music' as const,
        path: parsed.musicPath || musicPath,
        peaks: Array.isArray(parsed.musicPeaks) ? parsed.musicPeaks : [],
      },
    ]) {
      const storageKey = mediaStemStorageKey(input.workspaceId, input.mediaAssetId, stem.kind)
      const bytes = await input.store.uploadFileFromPath({
        workspaceId: input.workspaceId,
        storageKey,
        filePath: stem.path,
        mimeType: 'audio/wav',
      })
      await upsertMediaAudioStem({
        mediaAssetId: input.mediaAssetId,
        analysisRunId: input.analysisRunId,
        stemKind: stem.kind,
        storageKey,
        bytes,
        durationMs,
        peaks: stem.peaks,
        method: recordedMethod,
      })
    }
    return 'stemmed'
  } catch {
    return 'stem_failed'
  } finally {
    await unlink(voicePath).catch(() => {})
    await unlink(musicPath).catch(() => {})
  }
}

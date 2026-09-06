import { execFile } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { upsertMediaAudioStem } from '@/lib/db/media-stems'
import { resolveRepoScript } from '@/lib/repo-root'
import { mediaStemStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const execFileAsync = promisify(execFile)

type StemScriptResult = {
  method: string
  voicePath: string
  musicPath: string
  durationMs: number
  voicePeaks: number[]
  musicPeaks: number[]
}

export async function separateAndStoreAudioStems(input: {
  sourcePath: string
  workspaceId: string
  mediaAssetId: string
  analysisRunId: string
  store: S3ObjectStore
}): Promise<'stemmed' | 'stem_failed'> {
  const voicePath = join(tmpdir(), `videon-stem-voice-${randomUUID()}.wav`)
  const musicPath = join(tmpdir(), `videon-stem-music-${randomUUID()}.wav`)
  try {
    const scriptPath = await resolveRepoScript('scripts/separate-audio-stems.py')
    const { stdout } = await execFileAsync(
      'python3',
      [scriptPath, input.sourcePath, voicePath, musicPath, '--buckets', '240'],
      { maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    )
    const parsed = JSON.parse(stdout) as StemScriptResult
    const method = typeof parsed.method === 'string' ? parsed.method : 'ffmpeg_mid_side'
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
        method,
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

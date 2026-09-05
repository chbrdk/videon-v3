import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolveRepoScript } from '@/lib/repo-root'
import { transcriptionConfig } from '@/lib/runtime-config'

const execFileAsync = promisify(execFile)

export type TranscriptSegment = {
  startMs: number
  endMs: number
  text: string
}

export type TranscriptResult = {
  text: string
  segments: TranscriptSegment[]
}

function excerptForRange(segments: TranscriptSegment[], startMs: number, endMs: number): string {
  return segments
    .filter((segment) => segment.endMs > startMs && segment.startMs < endMs)
    .map((segment) => segment.text)
    .join(' ')
    .trim()
}

export function transcriptExcerptForScene(
  segments: TranscriptSegment[],
  startMs: number,
  endMs: number,
): string | undefined {
  const excerpt = excerptForRange(segments, startMs, endMs)
  return excerpt || undefined
}

export async function transcribeAudioFile(audioPath: string): Promise<TranscriptResult | null> {
  const config = transcriptionConfig()
  if (!config.enabled) return null

  try {
    await access(audioPath)
  } catch {
    throw new Error('Extracted audio file is missing')
  }

  const scriptPath = await resolveRepoScript('scripts/transcribe-audio.py')
  try {
    const { stdout } = await execFileAsync('python3', [scriptPath, audioPath], {
      env: {
        ...process.env,
        VIDEON_WHISPER_MODEL: config.whisperModel,
        VIDEON_WHISPER_LANGUAGE: config.language,
      },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    })
    const parsed = JSON.parse(stdout) as { text?: string; segments?: TranscriptSegment[]; error?: string }
    if (parsed.error) throw new Error(parsed.error)
    return {
      text: parsed.text?.trim() ?? '',
      segments: Array.isArray(parsed.segments) ? parsed.segments : [],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Whisper transcription failed'
    throw new Error(message)
  }
}

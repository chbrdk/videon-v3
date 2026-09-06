import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'
import { resolveRepoScript } from '@/lib/repo-root'
import { isOpenRouterTranscriptionConfigured, transcriptionConfig } from '@/lib/runtime-config'
import { transcribeAudioWithOpenRouter } from '@/lib/pipeline/openrouter-transcribe'

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

async function transcribeAudioLocally(audioPath: string): Promise<TranscriptResult> {
  const config = transcriptionConfig()
  const scriptPath = await resolveRepoScript('scripts/transcribe-audio.py')
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
}

async function runTranscriptionAttempt(
  label: string,
  fn: () => Promise<TranscriptResult>,
  errors: string[],
): Promise<TranscriptResult | null> {
  try {
    return await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : `${label} failed`
    errors.push(message)
    return null
  }
}

export async function transcribeAudioFile(audioPath: string): Promise<TranscriptResult | null> {
  const config = transcriptionConfig()
  if (!config.enabled) return null

  try {
    await access(audioPath)
  } catch {
    throw new Error('Extracted audio file is missing')
  }

  const errors: string[] = []

  if (config.provider === 'openrouter') {
    const result = await runTranscriptionAttempt('OpenRouter transcription', () => transcribeAudioWithOpenRouter(audioPath), errors)
    if (result) return result
    throw new Error(errors.join(' · ') || 'OpenRouter transcription failed')
  }

  if (config.provider === 'local') {
    const result = await runTranscriptionAttempt('Local Whisper transcription', () => transcribeAudioLocally(audioPath), errors)
    if (result) return result
    throw new Error(errors.join(' · ') || 'Local Whisper transcription failed')
  }

  // auto: prefer OpenRouter when configured (much better than CPU tiny/small), local as offline fallback.
  const attempts: Array<{ label: string; fn: () => Promise<TranscriptResult> }> = []
  if (isOpenRouterTranscriptionConfigured()) {
    attempts.push({ label: 'OpenRouter transcription', fn: () => transcribeAudioWithOpenRouter(audioPath) })
  }
  attempts.push({ label: 'Local Whisper transcription', fn: () => transcribeAudioLocally(audioPath) })

  for (const attempt of attempts) {
    const result = await runTranscriptionAttempt(attempt.label, attempt.fn, errors)
    if (result) return result
  }

  throw new Error(errors.join(' · ') || 'Transcription failed')
}

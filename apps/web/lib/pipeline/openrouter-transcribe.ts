import { readFile } from 'node:fs/promises'
import { openRouterApiBaseUrl, openRouterApiKey, transcriptionConfig } from '@/lib/runtime-config'
import type { TranscriptResult, TranscriptSegment } from '@/lib/pipeline/transcribe'

type VerboseSegment = {
  start?: number
  end?: number
  text?: string
}

type VerboseTranscriptionResponse = {
  text?: string
  segments?: VerboseSegment[]
  error?: { message?: string }
}

function mapVerboseSegments(segments: VerboseSegment[] | undefined): TranscriptSegment[] {
  if (!Array.isArray(segments)) return []
  return segments
    .map((segment) => {
      const text = segment.text?.trim() ?? ''
      if (!text) return null
      const startMs = Math.max(0, Math.round((segment.start ?? 0) * 1000))
      const endMs = Math.max(startMs + 1, Math.round((segment.end ?? segment.start ?? 0) * 1000))
      return { startMs, endMs, text }
    })
    .filter((segment): segment is TranscriptSegment => segment !== null)
}

export async function transcribeAudioWithOpenRouter(
  audioPath: string,
  options: { fetcher?: typeof fetch } = {},
): Promise<TranscriptResult> {
  const apiKey = openRouterApiKey()
  const apiBase = openRouterApiBaseUrl()
  if (!apiKey || !apiBase) {
    throw new Error('OpenRouter is not configured for transcription')
  }

  const config = transcriptionConfig()
  const audioBytes = await readFile(audioPath)
  const fetcher = options.fetcher ?? fetch
  const response = await fetcher(`${apiBase}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openRouterModel,
      language: config.language,
      response_format: 'verbose_json',
      input_audio: {
        data: audioBytes.toString('base64'),
        format: 'wav',
      },
    }),
  })

  const bodyText = await response.text()
  let body: VerboseTranscriptionResponse
  try {
    body = JSON.parse(bodyText) as VerboseTranscriptionResponse
  } catch {
    throw new Error(`OpenRouter transcription returned invalid JSON (${response.status})`)
  }

  if (!response.ok) {
    const message = body.error?.message ?? bodyText.slice(0, 240)
    throw new Error(`OpenRouter transcription failed (${response.status}): ${message}`)
  }

  const segments = mapVerboseSegments(body.segments)
  const text = body.text?.trim() || segments.map((segment) => segment.text).join(' ').trim()
  return { text, segments }
}

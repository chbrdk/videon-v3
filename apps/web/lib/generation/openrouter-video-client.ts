/**
 * Server-only OpenRouter Video Generation client.
 * Spec: specs/domain/media-generative-edit.md
 * Docs: https://openrouter.ai/docs/guides/overview/multimodal/video-generation
 *
 * Auth: OPENROUTER_API_KEY (Bearer). Not ZDR-eligible — never send zdr on these requests.
 */

import { openRouterApiBaseUrl, openRouterApiKey } from '@/lib/runtime-config'

export class GenerationGatewayError extends Error {
  constructor(
    message: string,
    readonly code: 'unconfigured' | 'provider_error' | 'timeout' | 'invalid_output',
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'GenerationGatewayError'
  }
}

/** @deprecated Use GenerationGatewayError */
export const FalGatewayError = GenerationGatewayError

export type GenerationEditInput = {
  /** OpenRouter model slug, e.g. bytedance/seedance-2.5 */
  model: string
  prompt: string
  videoUrl: string
  imageUrls?: string[]
  resolution: string
  /**
   * Seedance edit requires duration=-1 (output follows input video, 4–30s).
   * Fixed seconds only for providers that do not support match-input edit.
   */
  durationSeconds?: number
  durationMinSeconds?: number
  durationMaxSeconds?: number
  /** When true (default), send duration=-1 so edit output matches the source clip. */
  matchInputDuration?: boolean
  seed?: number | null
  generateAudio?: boolean
  onProgress?: (percent: number) => void | Promise<void>
}

export type GenerationCreateInput = {
  model: string
  prompt: string
  imageUrls?: string[]
  resolution: string
  durationSeconds: number
  durationMinSeconds?: number
  durationMaxSeconds?: number
  aspectRatio: '16:9' | '9:16' | '1:1' | 'auto'
  seed?: number | null
  generateAudio?: boolean
  onProgress?: (percent: number) => void | Promise<void>
}

export type GenerationResult = {
  requestId: string
  /** Content URL (requires Bearer) or provider URL */
  videoUrl: string
  requiresAuthDownload: boolean
}

function videosBaseUrl(): string {
  const configured = openRouterApiBaseUrl()
  const base = (configured || 'https://openrouter.ai/api/v1').replace(/\/$/, '')
  return base
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clampDurationSeconds(
  seconds: number,
  bounds?: { min?: number; max?: number },
): number {
  const min = bounds?.min ?? 4
  const max = bounds?.max ?? 30
  if (!Number.isFinite(seconds)) return Math.max(min, Math.min(max, 5))
  return Math.max(min, Math.min(max, Math.round(seconds)))
}

type SubmitResponse = {
  id?: string
  polling_url?: string
  status?: string
  error?: string | { message?: string }
}

type PollResponse = {
  id?: string
  status?: string
  polling_url?: string
  unsigned_urls?: string[]
  error?: string | { message?: string }
}

function errorMessage(error: string | { message?: string } | undefined): string {
  if (!error) return 'unknown error'
  if (typeof error === 'string') return error
  return error.message || 'unknown error'
}

async function openRouterVideoRoundTrip(input: {
  body: Record<string, unknown>
  onProgress?: (percent: number) => void | Promise<void>
}): Promise<GenerationResult> {
  const apiKey = openRouterApiKey()
  if (!apiKey) {
    throw new GenerationGatewayError('OpenRouter is not configured', 'unconfigured', false)
  }
  const base = videosBaseUrl()
  const submit = await fetch(`${base}/videos`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify(input.body),
  })
  if (!submit.ok) {
    const detail = await submit.text().catch(() => '')
    const retryable = submit.status >= 500 || submit.status === 429
    throw new GenerationGatewayError(
      `OpenRouter video submit failed (${submit.status}): ${detail.slice(0, 400)}`,
      'provider_error',
      retryable,
    )
  }

  const submitJson = (await submit.json()) as SubmitResponse
  const jobId = submitJson.id?.trim()
  if (!jobId) {
    throw new GenerationGatewayError('OpenRouter video submit returned no id', 'invalid_output', true)
  }
  const pollUrl =
    (typeof submitJson.polling_url === 'string' && submitJson.polling_url.trim()) ||
    `${base}/videos/${encodeURIComponent(jobId)}`

  const deadline = Date.now() + 45 * 60 * 1000
  let poll = 0
  let last: PollResponse = submitJson

  while (Date.now() < deadline) {
    poll += 1
    const statusRes = await fetch(pollUrl, { headers: authHeaders(apiKey) })
    if (!statusRes.ok) {
      const detail = await statusRes.text().catch(() => '')
      if (statusRes.status >= 500 || statusRes.status === 429) {
        await sleep(Math.min(15_000, 2000 + poll * 500))
        continue
      }
      throw new GenerationGatewayError(
        `OpenRouter video status failed (${statusRes.status}): ${detail.slice(0, 400)}`,
        'provider_error',
        false,
      )
    }
    last = (await statusRes.json()) as PollResponse
    const status = String(last.status || '').toLowerCase()
    if (input.onProgress) {
      const approx =
        status === 'pending' ? 30 : status === 'in_progress' ? 55 : status === 'completed' ? 80 : 40
      await input.onProgress(approx)
    }
    if (status === 'completed') break
    if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'expired') {
      throw new GenerationGatewayError(
        `OpenRouter video ${status}: ${errorMessage(last.error)}`,
        'provider_error',
        false,
      )
    }
    await sleep(Math.min(12_000, 2500 + poll * 400))
  }

  if (String(last.status || '').toLowerCase() !== 'completed') {
    throw new GenerationGatewayError('OpenRouter video request timed out', 'timeout', true)
  }

  const contentUrl = `${base}/videos/${encodeURIComponent(jobId)}/content?index=0`
  const unsigned = last.unsigned_urls?.find((u) => typeof u === 'string' && u.trim())
  return {
    requestId: jobId,
    videoUrl: unsigned?.trim() || contentUrl,
    requiresAuthDownload: true,
  }
}

/** Video-to-video edit via Seedance-style input_references. */
export async function runOpenRouterVideoEdit(input: GenerationEditInput): Promise<GenerationResult> {
  const input_references: Array<Record<string, unknown>> = [
    { type: 'video_url', video_url: { url: input.videoUrl } },
  ]
  for (const url of input.imageUrls ?? []) {
    if (!url.trim()) continue
    input_references.push({ type: 'image_url', image_url: { url: url.trim() } })
  }

  const matchInput = input.matchInputDuration !== false
  const duration = matchInput
    ? -1
    : clampDurationSeconds(input.durationSeconds ?? 5, {
        min: input.durationMinSeconds,
        max: input.durationMaxSeconds,
      })

  return openRouterVideoRoundTrip({
    body: {
      model: input.model,
      prompt: input.prompt,
      duration,
      resolution: input.resolution,
      generate_audio: input.generateAudio ?? false,
      seed: input.seed ?? undefined,
      input_references,
    },
    onProgress: input.onProgress,
  })
}

/** Text-to-video / image-to-video create. */
export async function runOpenRouterVideoCreate(input: GenerationCreateInput): Promise<GenerationResult> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    duration: clampDurationSeconds(input.durationSeconds, {
      min: input.durationMinSeconds,
      max: input.durationMaxSeconds,
    }),
    resolution: input.resolution,
    aspect_ratio: input.aspectRatio === 'auto' ? '16:9' : input.aspectRatio,
    generate_audio: input.generateAudio ?? true,
    seed: input.seed ?? undefined,
  }
  if (input.imageUrls?.length) {
    body.frame_images = [
      {
        type: 'image_url',
        image_url: { url: input.imageUrls[0] },
        frame_type: 'first_frame',
      },
    ]
    if (input.imageUrls.length > 1) {
      body.input_references = input.imageUrls.slice(1).map((url) => ({
        type: 'image_url',
        image_url: { url },
      }))
    }
  }

  return openRouterVideoRoundTrip({ body, onProgress: input.onProgress })
}

export async function downloadUrlToFile(
  url: string,
  destinationPath: string,
  opts?: { bearerToken?: string | null },
): Promise<void> {
  const { writeFile } = await import('node:fs/promises')
  const headers: HeadersInit = {}
  const token = opts?.bearerToken ?? openRouterApiKey()
  if (token && (/openrouter\.ai/i.test(url) || opts?.bearerToken)) {
    headers.Authorization = `Bearer ${token}`
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    throw new GenerationGatewayError(`download failed (${response.status})`, 'provider_error', true)
  }
  const buf = Buffer.from(await response.arrayBuffer())
  if (!buf.length) {
    throw new GenerationGatewayError('download returned empty body', 'invalid_output', true)
  }
  await writeFile(destinationPath, buf)
}

/** @deprecated Prefer runOpenRouterVideoEdit */
export async function runFalVideoEdit(input: {
  endpoint: string
  prompt: string
  videoUrl: string
  imageUrls?: string[]
  resolution: '480p' | '720p'
  seed?: number | null
  generateAudio?: boolean
  durationSeconds?: number
  onProgress?: (percent: number) => void | Promise<void>
}): Promise<GenerationResult> {
  return runOpenRouterVideoEdit({
    model: input.endpoint,
    prompt: input.prompt,
    videoUrl: input.videoUrl,
    imageUrls: input.imageUrls,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds ?? 5,
    seed: input.seed,
    generateAudio: input.generateAudio,
    onProgress: input.onProgress,
  })
}

/** @deprecated Prefer runOpenRouterVideoCreate */
export async function runFalVideoCreate(input: {
  endpoint: string
  prompt: string
  imageUrls?: string[]
  resolution: '480p' | '720p'
  durationSeconds: number
  aspectRatio: '16:9' | '9:16' | '1:1' | 'auto'
  seed?: number | null
  generateAudio?: boolean
  onProgress?: (percent: number) => void | Promise<void>
}): Promise<GenerationResult> {
  return runOpenRouterVideoCreate({
    model: input.endpoint,
    prompt: input.prompt,
    imageUrls: input.imageUrls,
    resolution: input.resolution,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    seed: input.seed,
    generateAudio: input.generateAudio,
    onProgress: input.onProgress,
  })
}

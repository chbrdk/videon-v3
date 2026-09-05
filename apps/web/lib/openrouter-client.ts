import { openRouterApiBaseUrl, openRouterApiKey } from './runtime-config'
import { defaultVisionLane, openRouterProviderPolicy, type VisionLane } from './vision-policy'
import {
  parseSceneInsight,
  sceneInsightJsonSchema,
  SCENE_INSIGHT_SCHEMA_VERSION,
  type SceneInsight,
} from './vision-schema'

export type VisionFrame = { id: string; timestampMs: number; dataUrl: string }

export type AnalyzeSceneInput = {
  locale: string
  startMs: number
  endMs: number
  frames: readonly VisionFrame[]
  transcriptExcerpt?: string
  userPseudonym: string
}

export type VisionProvenance = {
  requestedModel: string
  actualModel: string
  provider: string | null
  requestId: string | null
  promptVersion: 'videon.scene-analysis-prompt.v1'
  schemaVersion: typeof SCENE_INSIGHT_SCHEMA_VERSION
  usage: {
    promptTokens: number | null
    completionTokens: number | null
    reasoningTokens: number | null
    cachedTokens: number | null
    costUsd: string | null
  }
}

export type AnalyzeSceneResult = { insight: SceneInsight; provenance: VisionProvenance }

export class OpenRouterGatewayError extends Error {
  constructor(
    message: string,
    readonly code: 'unconfigured' | 'upstream' | 'invalid_output',
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

function scenePrompt(input: AnalyzeSceneInput): string {
  const frameIds = input.frames.map((frame) => frame.id).join(', ')
  return [
    `Return one JSON object matching ${SCENE_INSIGHT_SCHEMA_VERSION}.`,
    `Locale: ${input.locale}. Scene range: ${input.startMs}ms–${input.endMs}ms.`,
    `Allowed evidenceFrameIds: ${frameIds}.`,
    'Use only those frame ids for evidenceFrameIds. Do not invent ids.',
    'Use empty arrays when evidence is absent. Keep all text concise and factual.',
    input.transcriptExcerpt ? `Transcript excerpt: ${input.transcriptExcerpt.slice(0, 4_000)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asCost(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(6)
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

/** Server-only OpenRouter boundary. Browser clients never receive API keys or provider routing controls. */
export async function analyzeSceneWithOpenRouter(
  input: AnalyzeSceneInput,
  options: { lane?: VisionLane; fetcher?: typeof fetch } = {},
): Promise<AnalyzeSceneResult> {
  const apiKey = openRouterApiKey()
  const apiBase = openRouterApiBaseUrl()
  if (!apiKey || !apiBase) {
    throw new OpenRouterGatewayError('OpenRouter is not configured', 'unconfigured', false)
  }
  if (!input.frames.length) {
    throw new OpenRouterGatewayError('At least one evidence frame is required', 'invalid_output', false)
  }

  const lane = options.lane ?? defaultVisionLane()
  if (lane.inputMode !== 'frames') {
    throw new OpenRouterGatewayError('Direct-video requests require the gated clip adapter', 'unconfigured', false)
  }
  const fetcher = options.fetcher ?? fetch
  const policy = openRouterProviderPolicy()
  const responseFormat =
    lane.responseMode === 'json_schema'
      ? {
          type: 'json_schema',
          json_schema: {
            name: 'videon_scene_insight_v1',
            strict: true,
            schema: sceneInsightJsonSchema,
          },
        }
      : { type: 'json_object' }
  const response = await fetcher(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: lane.model,
      user: input.userPseudonym,
      response_format: responseFormat,
      provider: {
        data_collection: policy.dataCollection,
        ...(policy.zdr ? { zdr: true } : {}),
        ...(lane.providerRequireParameters ? { require_parameters: true } : {}),
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: scenePrompt(input) },
            ...input.frames.map((frame) => ({ type: 'image_url', image_url: { url: frame.dataUrl } })),
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    const detail = errorBody.trim().slice(0, 400)
    throw new OpenRouterGatewayError(
      detail
        ? `OpenRouter request failed (${response.status}): ${detail}`
        : `OpenRouter request failed (${response.status})`,
      'upstream',
      response.status >= 500 || response.status === 429,
    )
  }

  const body = (await response.json()) as Record<string, unknown>
  const choices = Array.isArray(body.choices) ? body.choices : []
  const first = choices[0] as { message?: { content?: unknown } } | undefined
  const content = typeof first?.message?.content === 'string' ? first.message.content : ''
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new OpenRouterGatewayError('OpenRouter returned invalid JSON', 'invalid_output', true)
  }
  const insight = parseSceneInsight(parsed, input.frames.map((frame) => frame.id))
  if (!insight) {
    throw new OpenRouterGatewayError('OpenRouter output does not satisfy the scene schema', 'invalid_output', true)
  }

  const usage = (body.usage ?? {}) as Record<string, unknown>
  const details = usage.completion_tokens_details as Record<string, unknown> | undefined
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  return {
    insight,
    provenance: {
      requestedModel: lane.model,
      actualModel: typeof body.model === 'string' ? body.model : lane.model,
      provider: typeof body.provider === 'string' ? body.provider : null,
      requestId: response.headers.get('x-request-id'),
      promptVersion: 'videon.scene-analysis-prompt.v1',
      schemaVersion: SCENE_INSIGHT_SCHEMA_VERSION,
      usage: {
        promptTokens: asNumber(usage.prompt_tokens),
        completionTokens: asNumber(usage.completion_tokens),
        reasoningTokens: asNumber(details?.reasoning_tokens),
        cachedTokens: asNumber(promptDetails?.cached_tokens),
        costUsd: asCost(usage.cost),
      },
    },
  }
}

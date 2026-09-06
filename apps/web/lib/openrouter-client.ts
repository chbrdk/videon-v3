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

type VisionRequestProfile = {
  responseMode: VisionLane['responseMode'] | 'none'
  providerRequireParameters: boolean
  includeProviderPolicy: boolean
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

function responseFormatForProfile(profile: VisionRequestProfile) {
  if (profile.responseMode === 'json_schema') {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'videon_scene_insight_v1',
        strict: true,
        schema: sceneInsightJsonSchema,
      },
    }
  }
  if (profile.responseMode === 'json_object') {
    return { type: 'json_object' }
  }
  return undefined
}

function isParameterRoutingFailure(status: number, detail: string): boolean {
  if (status !== 404 && status !== 422) return false
  return /parameter|routing|endpoint/i.test(detail)
}

function visionRequestProfiles(lane: VisionLane): VisionRequestProfile[] {
  const profiles: VisionRequestProfile[] = [
    {
      responseMode: lane.responseMode,
      providerRequireParameters: lane.providerRequireParameters,
      includeProviderPolicy: true,
    },
  ]

  if (lane.responseMode === 'json_schema' || lane.providerRequireParameters) {
    profiles.push({
      responseMode: 'json_object',
      providerRequireParameters: false,
      includeProviderPolicy: true,
    })
  }

  profiles.push({
    responseMode: 'none',
    providerRequireParameters: false,
    includeProviderPolicy: true,
  })

  profiles.push({
    responseMode: 'none',
    providerRequireParameters: false,
    includeProviderPolicy: false,
  })

  return profiles
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
  const profiles = visionRequestProfiles(lane)
  const routingErrors: string[] = []

  for (const profile of profiles) {
    const responseFormat = responseFormatForProfile(profile)
    const body: Record<string, unknown> = {
      model: lane.model,
      user: input.userPseudonym,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: scenePrompt(input) },
            ...input.frames.map((frame) => ({ type: 'image_url', image_url: { url: frame.dataUrl } })),
          ],
        },
      ],
    }
    if (responseFormat) body.response_format = responseFormat
    if (profile.includeProviderPolicy) {
      body.provider = {
        data_collection: policy.dataCollection,
        ...(policy.zdr ? { zdr: true } : {}),
        ...(profile.providerRequireParameters ? { require_parameters: true } : {}),
      }
    }

    const response = await fetcher(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      const detail = errorBody.trim().slice(0, 400)
      const message = detail
        ? `OpenRouter request failed (${response.status}): ${detail}`
        : `OpenRouter request failed (${response.status})`
      if (isParameterRoutingFailure(response.status, detail)) {
        routingErrors.push(message)
        continue
      }
      throw new OpenRouterGatewayError(
        message,
        'upstream',
        response.status >= 500 || response.status === 429,
      )
    }

    const payload = (await response.json()) as Record<string, unknown>
    const choices = Array.isArray(payload.choices) ? payload.choices : []
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

    const usage = (payload.usage ?? {}) as Record<string, unknown>
    const details = usage.completion_tokens_details as Record<string, unknown> | undefined
    const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
    return {
      insight,
      provenance: {
        requestedModel: lane.model,
        actualModel: typeof payload.model === 'string' ? payload.model : lane.model,
        provider: typeof payload.provider === 'string' ? payload.provider : null,
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

  throw new OpenRouterGatewayError(
    routingErrors.at(-1) ?? 'OpenRouter request failed (404): no compatible provider route',
    'upstream',
    true,
  )
}

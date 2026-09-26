/**
 * Fire-and-forget usage events to Plexon.
 * Spec: plexon knowledge/usage-tracking.md
 */
import {
  PLEXON_CONTRACT_VERSION_HEADER,
  PLEXON_FEDERATION_CONTRACT_VERSION,
  PLEXON_SERVICE_SECRET_HEADER,
} from '@videon-v3/contracts'
import {
  isPlexonAuthConfigured,
  plexonAuthUrl,
  plexonServiceSecret,
} from './runtime-config'

export type UsageReportParams = {
  userId: string
  eventType: string
  rawUnits: Record<string, unknown>
  idempotencyKey?: string
}

export type LlmTokenUsage = {
  input_tokens: number
  output_tokens: number
  estimated?: boolean
  model?: string
}

export function isUsageReportingConfigured(): boolean {
  return isPlexonAuthConfigured()
}

export function reportUsage(params: UsageReportParams): void {
  try {
    if (!isPlexonAuthConfigured()) return
    if (!params?.userId || !params?.eventType) return
    const url = `${plexonAuthUrl().replace(/\/$/, '')}/api/services/usage/events`
    const body = {
      user_id: params.userId,
      service: 'videon' as const,
      event_type: params.eventType,
      raw_units: params.rawUnits ?? {},
      ...(params.idempotencyKey ? { idempotency_key: params.idempotencyKey } : {}),
    }
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [PLEXON_CONTRACT_VERSION_HEADER]: PLEXON_FEDERATION_CONTRACT_VERSION,
        [PLEXON_SERVICE_SECRET_HEADER]: plexonServiceSecret(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    }).catch((e) => {
      console.warn('[VIDEON] usage report failed:', e?.message ?? e)
    })
  } catch (e) {
    console.warn('[VIDEON] usage report setup failed:', e instanceof Error ? e.message : e)
  }
}

export function reportLlmUsage(input: {
  userId: string | null | undefined
  usage: LlmTokenUsage
  surface?: string
  idempotencyKey?: string
}): void {
  if (!input.userId) return
  if (input.usage.input_tokens <= 0 && input.usage.output_tokens <= 0) return
  reportUsage({
    userId: input.userId,
    eventType: 'llm_request',
    rawUnits: {
      input_tokens: input.usage.input_tokens,
      output_tokens: input.usage.output_tokens,
      ...(input.usage.estimated ? { estimated: true } : {}),
      ...(input.usage.model ? { model: input.usage.model } : {}),
      ...(input.surface ? { surface: input.surface } : {}),
    },
    idempotencyKey: input.idempotencyKey,
  })
}

export function reportVendorCostUsd(input: {
  userId: string | null | undefined
  costUsd: number
  surface?: string
  model?: string
  idempotencyKey?: string
}): void {
  if (!input.userId) return
  const cost = Number(input.costUsd)
  if (!Number.isFinite(cost) || cost < 0) return
  reportUsage({
    userId: input.userId,
    eventType: 'vendor_cost',
    rawUnits: {
      cost_usd: cost,
      ...(input.surface ? { surface: input.surface } : {}),
      ...(input.model ? { model: input.model } : {}),
    },
    idempotencyKey: input.idempotencyKey,
  })
}

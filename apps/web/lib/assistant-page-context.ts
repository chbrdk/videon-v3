/**
 * Assistant host page context — mirrors plexon-v3/specs/domain/assistant-page-context.md
 */

import { paths } from './paths'
import { isRealPlatformProjectId } from './plexon-platform-id'

export const ASSISTANT_ENTITY_VIDEON_MEDIA = 'media' as const
export const ASSISTANT_ENTITY_VIDEON_CUT = 'cut' as const
export const ASSISTANT_ENTITY_VIDEON_ANALYSIS = 'analysis' as const

export type AssistantPageContext = {
  product: typeof paths.productId
  pathname: string
  capability?: string
  platformProjectId?: string
  entityType?: string
  entityId?: string
  entityUpdatedAt?: string
}

/** Real Plexon Collection UUID only. */
export function normalizeAssistantPlatformProjectId(
  id: string | null | undefined,
): string | undefined {
  const trimmed = id?.trim()
  if (!trimmed || !isRealPlatformProjectId(trimmed)) return undefined
  return trimmed
}

export function buildCollectionAssistantPageContext(input: {
  pathname: string
  platformProjectId?: string | null
  capability?: string | null
  entityType?: string | null
  entityId?: string | null
}): AssistantPageContext {
  return {
    product: paths.productId,
    pathname: input.pathname.trim() || '/',
    platformProjectId: normalizeAssistantPlatformProjectId(input.platformProjectId),
    capability: input.capability?.trim() || undefined,
    entityType: input.entityType?.trim() || undefined,
    entityId: input.entityId?.trim() || undefined,
  }
}

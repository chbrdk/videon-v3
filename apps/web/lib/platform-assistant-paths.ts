/** Central Assistant embed paths — plexon-v3/specs/api/assistant-embed.md */

import { paths } from './paths'
import {
  normalizeAssistantPlatformProjectId,
  type AssistantPageContext,
} from './assistant-page-context'

export const PATH_ASSISTANT_EMBED = paths.pathAssistantEmbed
export const PATH_ASSISTANT_EXPAND = paths.pathAssistantExpand
export const ASSISTANT_EMBED_PRODUCT = 'videon' as const
export const ASSISTANT_CONVERSATION_QUERY_PARAM = 'c'
export const ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM = 'project'
export const ASSISTANT_EMBED_PRODUCT_QUERY_PARAM = 'product'
export const ASSISTANT_EMBED_CAPABILITY_QUERY_PARAM = 'capability'
export const ASSISTANT_EMBED_PATHNAME_QUERY_PARAM = 'pathname'
export const ASSISTANT_EMBED_THEME_QUERY_PARAM = 'theme'
export const ASSISTANT_EMBED_ENTITY_TYPE_QUERY_PARAM = 'entityType'
export const ASSISTANT_EMBED_ENTITY_ID_QUERY_PARAM = 'entityId'
export const ASSISTANT_EMBED_ENTITY_UPDATED_AT_QUERY_PARAM = 'entityUpdatedAt'

const HOST_SOURCE = 'plexon-assistant-host' as const

/** Browser-safe Plexon origin for assistant iframe (never hardcode). */
export function getPlexonPublicBaseUrl(): string {
  // Static NEXT_PUBLIC_* reads so Next can inline into the client bundle.
  const pub = process.env.NEXT_PUBLIC_PLEXON_URL?.trim()
  if (pub) return pub.replace(/\/$/, '')
  const base = process.env.NEXT_PLEXON_BASE_URL?.trim()
  if (base) return base.replace(/\/$/, '')
  const auth = process.env.PLEXON_AUTH_URL?.trim()
  if (auth) return auth.replace(/\/$/, '')
  return ''
}

export function readHostThemeId(
  doc: Document | null | undefined = typeof document !== 'undefined' ? document : null,
): string | null {
  if (!doc?.documentElement) return null
  return doc.documentElement.getAttribute('data-theme')
}

export function mergeAssistantHostPageContext(input: {
  pathname: string | null | undefined
  platformProjectId?: string | null
  capability?: string | null
  published: AssistantPageContext | null
}): AssistantPageContext | null {
  const pathname = (input.pathname ?? '').trim() || '/'
  const propCollection = normalizeAssistantPlatformProjectId(input.platformProjectId)
  if (input.published) {
    return {
      ...input.published,
      pathname: input.published.pathname || pathname,
      platformProjectId: input.published.platformProjectId ?? propCollection,
      capability:
        input.published.capability ?? (input.capability?.trim() || undefined),
    }
  }
  if (!propCollection && !input.capability?.trim()) {
    return {
      product: paths.productId,
      pathname,
    }
  }
  return {
    product: paths.productId,
    pathname,
    platformProjectId: propCollection,
    capability: input.capability?.trim() || undefined,
  }
}

export function buildPlatformAssistantEmbedUrl(opts: {
  platformProjectId?: string | null
  capability?: string | null
  pathname?: string | null
  conversationId?: string | null
  theme?: string | null
  entityType?: string | null
  entityId?: string | null
  entityUpdatedAt?: string | null
}): string | null {
  const base = getPlexonPublicBaseUrl()
  if (!base) return null
  const params = new URLSearchParams()
  params.set(ASSISTANT_EMBED_PRODUCT_QUERY_PARAM, ASSISTANT_EMBED_PRODUCT)
  const collection = normalizeAssistantPlatformProjectId(opts.platformProjectId)
  if (collection) {
    params.set(ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM, collection)
  }
  if (opts.conversationId?.trim()) {
    params.set(ASSISTANT_CONVERSATION_QUERY_PARAM, opts.conversationId.trim())
  }
  if (opts.capability?.trim()) {
    params.set(ASSISTANT_EMBED_CAPABILITY_QUERY_PARAM, opts.capability.trim())
  }
  if (opts.pathname?.trim()) {
    params.set(ASSISTANT_EMBED_PATHNAME_QUERY_PARAM, opts.pathname.trim())
  }
  if (opts.theme?.trim()) {
    params.set(ASSISTANT_EMBED_THEME_QUERY_PARAM, opts.theme.trim())
  }
  if (opts.entityType?.trim()) {
    params.set(ASSISTANT_EMBED_ENTITY_TYPE_QUERY_PARAM, opts.entityType.trim())
  }
  if (opts.entityId?.trim()) {
    params.set(ASSISTANT_EMBED_ENTITY_ID_QUERY_PARAM, opts.entityId.trim())
  }
  if (opts.entityUpdatedAt?.trim()) {
    params.set(ASSISTANT_EMBED_ENTITY_UPDATED_AT_QUERY_PARAM, opts.entityUpdatedAt.trim())
  }
  return `${base}${PATH_ASSISTANT_EMBED}?${params.toString()}`
}

export function buildPlatformAssistantExpandUrl(
  conversationId?: string | null,
  projectId?: string | null,
): string | null {
  const base = getPlexonPublicBaseUrl()
  if (!base) return null
  const params = new URLSearchParams()
  if (conversationId?.trim()) params.set(ASSISTANT_CONVERSATION_QUERY_PARAM, conversationId.trim())
  const collection = normalizeAssistantPlatformProjectId(projectId)
  if (collection) params.set(ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM, collection)
  const qs = params.toString()
  return qs ? `${base}${PATH_ASSISTANT_EXPAND}?${qs}` : `${base}${PATH_ASSISTANT_EXPAND}`
}

export function postPlatformAssistantTheme(
  frame: Window | null | undefined,
  targetOrigin: string,
  themeId: string,
): void {
  if (!frame || !targetOrigin || !themeId) return
  frame.postMessage({ source: HOST_SOURCE, type: 'assistant:theme', themeId }, targetOrigin)
}

export type AssistantHostContextMessage = {
  product: typeof ASSISTANT_EMBED_PRODUCT
  platformProjectId?: string
  capability?: string
  pathname?: string
  entityType?: string
  entityId?: string
  entityUpdatedAt?: string
}

export function postPlatformAssistantContext(
  frame: Window | null | undefined,
  targetOrigin: string,
  context: AssistantHostContextMessage,
): void {
  if (!frame || !targetOrigin) return
  frame.postMessage(
    {
      source: HOST_SOURCE,
      type: 'assistant:context',
      ...context,
    },
    targetOrigin,
  )
}

/** Central Assistant embed paths — plexon-v3/specs/api/assistant-embed.md */

import { paths } from './paths'

export const PATH_ASSISTANT_EMBED = paths.pathAssistantEmbed
export const PATH_ASSISTANT_EXPAND = paths.pathAssistantExpand
export const ASSISTANT_EMBED_PRODUCT = 'videon' as const
export const ASSISTANT_CONVERSATION_QUERY_PARAM = 'c'
export const ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM = 'project'
export const ASSISTANT_EMBED_PRODUCT_QUERY_PARAM = 'product'
export const ASSISTANT_EMBED_CAPABILITY_QUERY_PARAM = 'capability'
export const ASSISTANT_EMBED_PATHNAME_QUERY_PARAM = 'pathname'
export const ASSISTANT_EMBED_THEME_QUERY_PARAM = 'theme'

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

export function buildPlatformAssistantEmbedUrl(opts: {
  platformProjectId?: string | null
  capability?: string | null
  pathname?: string | null
  conversationId?: string | null
  theme?: string | null
}): string | null {
  const base = getPlexonPublicBaseUrl()
  if (!base) return null
  const params = new URLSearchParams()
  params.set(ASSISTANT_EMBED_PRODUCT_QUERY_PARAM, ASSISTANT_EMBED_PRODUCT)
  if (opts.platformProjectId?.trim()) {
    params.set(ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM, opts.platformProjectId.trim())
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
  if (projectId?.trim()) params.set(ASSISTANT_PLATFORM_PROJECT_QUERY_PARAM, projectId.trim())
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

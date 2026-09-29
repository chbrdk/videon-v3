'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '../lib/msqdx-ui'
import { ChatOverlay } from '../lib/msqdx-ui-client'
import { NavIconChat } from './nav-icons'
import { useAssistantPageContext } from './assistant-page-context'
import {
  ASSISTANT_EMBED_PRODUCT,
  buildPlatformAssistantEmbedUrl,
  buildPlatformAssistantExpandUrl,
  getPlexonPublicBaseUrl,
  mergeAssistantHostPageContext,
  postPlatformAssistantContext,
  postPlatformAssistantTheme,
  readHostThemeId,
} from '../lib/platform-assistant-paths'

const EMBED_SOURCE = 'plexon-assistant-embed'

function isEmbedMessage(data: unknown): data is {
  source: string
  type: string
  conversationId?: string
  project?: string
} {
  if (!data || typeof data !== 'object') return false
  const row = data as Record<string, unknown>
  return row.source === EMBED_SOURCE && typeof row.type === 'string'
}

/** Platform Assistant FAB + ChatOverlay — plexon-v3 central-assistant-flyout + page-context. */
export function PlatformAssistantHost({
  platformProjectId,
  capability,
}: {
  platformProjectId?: string | null
  capability?: string | null
}) {
  const pathname = usePathname()
  const publishedPageContext = useAssistantPageContext()
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [themeId, setThemeId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)
  const embedSrcLockedRef = useRef(false)

  const pageContext = useMemo(
    () =>
      mergeAssistantHostPageContext({
        pathname,
        platformProjectId,
        capability,
        published: publishedPageContext,
      }),
    [pathname, platformProjectId, capability, publishedPageContext],
  )

  const plexonOrigin = useMemo(() => {
    const base = getPlexonPublicBaseUrl()
    if (!base) return ''
    try {
      return new URL(base).origin
    } catch {
      return base
    }
  }, [])

  useEffect(() => {
    const sync = () => setThemeId(readHostThemeId())
    sync()
    const root = document.documentElement
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  /**
   * Freeze iframe src while open — conversation / entity churn must not remount
   * the embed. Live updates via assistant:context / assistant:theme.
   * Spec: assistant-embed.md § Iframe stability.
   */
  useEffect(() => {
    if (!open) {
      embedSrcLockedRef.current = false
      setEmbedSrc(null)
      return
    }
    if (embedSrcLockedRef.current) return
    const next = buildPlatformAssistantEmbedUrl({
      platformProjectId: pageContext?.platformProjectId ?? platformProjectId,
      capability: pageContext?.capability ?? capability,
      pathname: pageContext?.pathname ?? pathname,
      conversationId,
      theme: themeId,
      entityType: pageContext?.entityType,
      entityId: pageContext?.entityId,
    })
    if (!next) return
    embedSrcLockedRef.current = true
    setEmbedSrc(next)
  }, [
    open,
    pageContext?.platformProjectId,
    pageContext?.capability,
    pageContext?.pathname,
    pageContext?.entityType,
    pageContext?.entityId,
    platformProjectId,
    capability,
    pathname,
    conversationId,
    themeId,
  ])

  const postContextToEmbed = useCallback(() => {
    if (!open || !plexonOrigin) return
    const frame = iframeRef.current?.contentWindow
    if (!frame) return
    postPlatformAssistantContext(frame, plexonOrigin, {
      product: ASSISTANT_EMBED_PRODUCT,
      platformProjectId: pageContext?.platformProjectId,
      capability: pageContext?.capability,
      pathname: pageContext?.pathname ?? pathname ?? undefined,
      entityType: pageContext?.entityType,
      entityId: pageContext?.entityId,
      entityUpdatedAt: pageContext?.entityUpdatedAt,
    })
  }, [open, plexonOrigin, pageContext, pathname])

  const navigateExpand = useCallback(() => {
    setOpen(false)
    const url = buildPlatformAssistantExpandUrl(
      conversationId,
      pageContext?.platformProjectId ?? platformProjectId,
    )
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }, [conversationId, pageContext?.platformProjectId, platformProjectId])

  const onMessage = useCallback(
    (event: MessageEvent) => {
      if (plexonOrigin && event.origin !== plexonOrigin) return
      if (!isEmbedMessage(event.data)) return
      if (event.data.type === 'assistant:close') {
        setOpen(false)
        return
      }
      if (event.data.type === 'assistant:conversation' && event.data.conversationId) {
        setConversationId(event.data.conversationId)
        return
      }
      if (event.data.type === 'assistant:ready') {
        if (event.data.conversationId) setConversationId(event.data.conversationId)
        postContextToEmbed()
        return
      }
      if (event.data.type === 'assistant:expand') {
        setOpen(false)
        const url = buildPlatformAssistantExpandUrl(
          event.data.conversationId || conversationId,
          event.data.project || pageContext?.platformProjectId || platformProjectId,
        )
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      }
    },
    [
      plexonOrigin,
      conversationId,
      pageContext?.platformProjectId,
      platformProjectId,
      postContextToEmbed,
    ],
  )

  useEffect(() => {
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onMessage])

  useEffect(() => {
    if (!open || !themeId || !plexonOrigin) return
    postPlatformAssistantTheme(iframeRef.current?.contentWindow, plexonOrigin, themeId)
  }, [open, themeId, plexonOrigin, embedSrc])

  useEffect(() => {
    postContextToEmbed()
  }, [postContextToEmbed])

  if (!getPlexonPublicBaseUrl()) return null

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        className="platform-assistant-fab"
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        icon={<NavIconChat />}
      />
      <ChatOverlay
        open={open}
        onOpenChange={setOpen}
        title="Assistant"
        placement="dock-end"
        headerActions={
          <Button type="button" variant="subtle" size="sm" onClick={navigateExpand}>
            Open workspace
          </Button>
        }
      >
        {embedSrc ? (
          <iframe
            ref={iframeRef}
            title="Platform assistant"
            src={embedSrc}
            className="platform-assistant-embed-frame"
            data-product={ASSISTANT_EMBED_PRODUCT}
          />
        ) : null}
      </ChatOverlay>
    </>
  )
}

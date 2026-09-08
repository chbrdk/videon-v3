'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '../lib/msqdx-ui'
import { ChatOverlay } from '../lib/msqdx-ui-client'
import { NavIconChat } from './nav-icons'
import {
  ASSISTANT_EMBED_PRODUCT,
  buildPlatformAssistantEmbedUrl,
  buildPlatformAssistantExpandUrl,
  getPlexonPublicBaseUrl,
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

/** Platform Assistant FAB + ChatOverlay — plexon-v3 central-assistant-flyout. */
export function PlatformAssistantHost({
  platformProjectId,
  capability,
}: {
  platformProjectId?: string | null
  capability?: string | null
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [themeId, setThemeId] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

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

  const embedSrc = useMemo(() => {
    if (!open) return null
    return buildPlatformAssistantEmbedUrl({
      platformProjectId,
      capability,
      pathname,
      conversationId,
      theme: themeId,
    })
  }, [open, platformProjectId, capability, pathname, conversationId, themeId])

  const navigateExpand = useCallback(() => {
    setOpen(false)
    const url = buildPlatformAssistantExpandUrl(conversationId, platformProjectId)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }, [conversationId, platformProjectId])

  const onMessage = useCallback(
    (event: MessageEvent) => {
      if (plexonOrigin && event.origin !== plexonOrigin) return
      if (!isEmbedMessage(event.data)) return
      if (event.data.type === 'assistant:close') {
        setOpen(false)
        return
      }
      if (
        (event.data.type === 'assistant:conversation' || event.data.type === 'assistant:ready') &&
        event.data.conversationId
      ) {
        setConversationId(event.data.conversationId)
        return
      }
      if (event.data.type === 'assistant:expand') {
        setOpen(false)
        const url = buildPlatformAssistantExpandUrl(
          event.data.conversationId || conversationId,
          event.data.project || platformProjectId,
        )
        if (url) window.open(url, '_blank', 'noopener,noreferrer')
      }
    },
    [plexonOrigin, conversationId, platformProjectId],
  )

  useEffect(() => {
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onMessage])

  useEffect(() => {
    if (!open || !themeId || !plexonOrigin) return
    postPlatformAssistantTheme(iframeRef.current?.contentWindow, plexonOrigin, themeId)
  }, [open, themeId, plexonOrigin, embedSrc])

  if (!getPlexonPublicBaseUrl()) return null

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        className="platform-assistant-fab"
        aria-label={open ? 'Assistent schließen' : 'Assistent öffnen'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        icon={<NavIconChat />}
      />
      <ChatOverlay
        open={open}
        onOpenChange={setOpen}
        title="Assistent"
        placement="dock-end"
        headerActions={
          <Button type="button" variant="subtle" size="sm" onClick={navigateExpand}>
            Workspace öffnen
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

'use client'

/**
 * Suite Help Hub host (iframe → Plexon `/help/embed`).
 * Spec: plexon-v3/specs/domain/suite-help-docs.md (Wave 2)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Button } from '../lib/msqdx-ui'
import { Dialog } from '../lib/msqdx-ui-client'
import { useAssistantPageContext } from './assistant-page-context'
import {
  getPlexonPublicBaseUrl,
  mergeAssistantHostPageContext,
  readHostThemeId,
} from '../lib/platform-assistant-paths'
import { paths } from '../lib/paths'

const HELP_OPEN_EVENT = 'plexon:help-open'
type HelpOpenDetail = { articleId?: string | null; query?: string | null }

function HelpGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.35-1.1.8-1.1 1.6V14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  )
}

function buildHelpEmbedSrc(opts: {
  pathname: string
  capability?: string | null
  articleId?: string | null
  theme?: string | null
  platformProjectId?: string | null
}): string | null {
  const base = getPlexonPublicBaseUrl()
  if (!base) return null
  const params = new URLSearchParams()
  params.set('product', paths.productId)
  if (opts.pathname) params.set('pathname', opts.pathname)
  if (opts.capability?.trim()) params.set('capability', opts.capability.trim())
  if (opts.articleId?.trim()) params.set('article', opts.articleId.trim())
  if (opts.theme?.trim()) params.set('theme', opts.theme.trim())
  if (opts.platformProjectId?.trim()) params.set('project', opts.platformProjectId.trim())
  return `${base.replace(/\/$/, '')}${paths.pathHelpEmbed}?${params.toString()}`
}

export function PlatformHelpHost({
  platformProjectId,
  capability,
  placement = 'fixed',
}: {
  platformProjectId?: string | null
  capability?: string | null
  /** `topbar` = inline control; `fixed` = top-end chip (rail-only shells). */
  placement?: 'topbar' | 'fixed'
}) {
  const pathname = usePathname()
  const published = useAssistantPageContext()
  const [open, setOpen] = useState(false)
  const [themeId, setThemeId] = useState<string | null>(null)
  const [articleId, setArticleId] = useState<string | null>(null)
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)

  const pageContext = useMemo(
    () =>
      mergeAssistantHostPageContext({
        pathname,
        platformProjectId,
        capability,
        published,
      }),
    [pathname, platformProjectId, capability, published],
  )

  useEffect(() => {
    const sync = () => setThemeId(readHostThemeId())
    sync()
    const root = document.documentElement
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const openHub = useCallback(
    (detail?: HelpOpenDetail) => {
      const nextArticle = detail?.articleId?.trim() || null
      setArticleId(nextArticle)
      const src = buildHelpEmbedSrc({
        pathname: pageContext?.pathname || pathname || '/',
        capability: pageContext?.capability || capability || paths.productId,
        articleId: nextArticle,
        theme: themeId,
        platformProjectId: pageContext?.platformProjectId || platformProjectId,
      })
      setEmbedSrc(src)
      setOpen(Boolean(src))
    },
    [capability, pageContext, pathname, platformProjectId, themeId],
  )

  useEffect(() => {
    function onHelpOpen(event: Event) {
      const detail = (event as CustomEvent<HelpOpenDetail>).detail
      openHub(detail ?? {})
    }
    window.addEventListener(HELP_OPEN_EVENT, onHelpOpen)
    return () => window.removeEventListener(HELP_OPEN_EVENT, onHelpOpen)
  }, [openHub])

  if (!getPlexonPublicBaseUrl()) return null

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={placement === 'fixed' ? 'platform-help-trigger platform-help-trigger--fixed' : 'platform-help-trigger'}
      aria-label="Open help"
      title="Help"
      onClick={() => openHub()}
      data-testid="platform-help-host-trigger"
      icon={<HelpGlyph />}
    >
      Help
    </Button>
  )

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Help"
        actions={
          <Button type="button" variant="subtle" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {open && embedSrc ? (
          <iframe
            title="Suite help"
            src={embedSrc}
            className="platform-help-embed-frame"
            data-article={articleId || undefined}
          />
        ) : (
          <p>Plexon help URL is not configured.</p>
        )}
      </Dialog>
    </>
  )
}

export function dispatchProductHelpOpen(detail: HelpOpenDetail = {}): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(HELP_OPEN_EVENT, { detail }))
}

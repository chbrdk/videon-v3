'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { AppFrame, shellFrameStyle } from '../lib/msqdx-ui-shell'
import { Avatar } from '@msqdx/ui'
import { useActiveCollection } from './collection-context'
import {
  NavIconAnalyses,
  NavIconChat,
  NavIconLibrary,
  NavIconOverview,
  NavIconProjects,
} from './nav-icons'
import { paths } from '../lib/paths'
import { workspaceHref } from '../lib/collection-context'
import { ShellBrandCorner } from './shell-brand-corner'
import { PlatformAssistantHost } from './platform-assistant-host'
import { useUserPrefs } from '../lib/user-prefs'

/** Chat · Home · Projekte · Mediathek · Analysen — Upload/Cuts via deep links only. */
const PRIMARY_NAV_IDS = [
  { id: 'chat', route: paths.routes.chat, labelKey: 'nav.chat', Icon: NavIconChat },
  { id: 'home', route: paths.routes.home, labelKey: 'nav.home', Icon: NavIconOverview },
  {
    id: 'projects',
    route: paths.routes.projects,
    labelKey: 'nav.projects',
    Icon: NavIconProjects,
  },
  { id: 'library', route: paths.routes.library, labelKey: 'nav.library', Icon: NavIconLibrary },
  {
    id: 'analyses',
    route: paths.routes.analyses,
    labelKey: 'nav.analyses',
    Icon: NavIconAnalyses,
  },
] as const

export function AppShell({
  children,
  description,
  editor = false,
}: {
  children: ReactNode
  description?: string
  /** @deprecated Global page title removed — magazine heroes own identity. */
  title?: string | null
  editor?: boolean
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { platformProjectId } = useActiveCollection()
  const { displayName: prefName, t } = useUserPrefs()
  const displayName =
    prefName.trim() && prefName !== paths.defaultDisplayName
      ? prefName
      : session?.user?.name?.trim() || session?.user?.email?.trim() || paths.defaultDisplayName

  const frameStyle = useMemo(
    () =>
      shellFrameStyle({
        railInsetRem: paths.railInsetRem,
        railGapRem: paths.railGapRem,
        railWidthRem: paths.railWidthRem,
        mainGutterRem: editor ? 0 : paths.mainGutterRem,
      }),
    [editor],
  )

  function isActive(route: string, href: string): boolean {
    if (route === paths.routes.home) return pathname === href
    if (route === paths.routes.projects) {
      return (
        pathname.startsWith(paths.routes.projects) || pathname.startsWith(paths.routes.collections)
      )
    }
    const base = href.split('?')[0]
    return pathname === base || pathname.startsWith(`${base}/`)
  }

  const navItems = useMemo(
    () =>
      PRIMARY_NAV_IDS.map((item) => {
        const href =
          item.id === 'library' ||
          item.id === 'projects' ||
          item.id === 'home' ||
          item.id === 'chat'
            ? item.route
            : workspaceHref(item.route, platformProjectId)
        return {
          id: item.id,
          href,
          label: t(item.labelKey),
          Icon: item.Icon,
          active: isActive(item.route, href),
        }
      }),
    [pathname, platformProjectId, t],
  )

  const settingsActive = pathname.startsWith(paths.routes.settings)
  const primaryAria = t('nav.primaryAria')
  const settingsLabel = t('nav.settings')
  const settingsAria = t('nav.settingsAria')

  return (
    <AppFrame
      railEdge={paths.railDockEdge}
      style={frameStyle}
      className={
        editor
          ? 'videon-app-frame--top-chrome videon-app-frame--editor'
          : 'videon-app-frame--top-chrome'
      }
      shellCorners
      shellCornerRadius={paths.brandCornerRadiusPx}
      brandCorner={<ShellBrandCorner />}
      topbar={
        <>
          <div className="topbar-brand videon-topbar-lead">
            <nav className="videon-top-nav" aria-label={primaryAria}>
              {navItems.map((item) => {
                const Icon = item.Icon
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={
                      item.active ? 'videon-top-nav__link is-active' : 'videon-top-nav__link'
                    }
                    aria-current={item.active ? 'page' : undefined}
                    aria-label={item.label}
                    title={item.label}
                    data-nav-id={item.id}
                  >
                    <span className="videon-top-nav__icon" aria-hidden="true">
                      <Icon />
                    </span>
                  </Link>
                )
              })}
              <Link
                href={paths.routes.settings}
                className={
                  settingsActive
                    ? 'videon-top-nav__link videon-top-nav__settings is-active'
                    : 'videon-top-nav__link videon-top-nav__settings'
                }
                aria-current={settingsActive ? 'page' : undefined}
                aria-label={settingsAria}
                title={settingsLabel}
                data-nav-id="settings"
              >
                <span className="videon-top-nav__icon" aria-hidden="true">
                  <Avatar name={displayName} size="sm" className="rail-avatar" />
                </span>
              </Link>
            </nav>
          </div>
          <div className="topbar-right videon-topbar-trail" data-testid="videon-topbar-trail" />
        </>
      }
    >
      <div className={`videon-stage${editor ? ' videon-stage--editor' : ' videon-stage--flush-top'}`}>
        {description && !editor ? <p className="videon-page-lead">{description}</p> : null}
        {children}
      </div>
      <PlatformAssistantHost platformProjectId={platformProjectId} />
    </AppFrame>
  )
}

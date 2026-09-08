'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  AppFrame,
  MsqdxLogoMark,
  NavRail,
  ShellBackButton,
  shellFrameStyle,
  type RailDockEdge,
} from '../lib/msqdx-ui-shell'
import { Avatar } from '@msqdx/ui'
import { useActiveCollection } from './collection-context'
import { NavIconAnalyses, NavIconCuts, NavIconLibrary, NavIconOverview, NavIconUpload } from './nav-icons'
import { paths } from '../lib/paths'
import { workspaceHref } from '../lib/collection-context'
import { ShellBrandCorner } from './shell-brand-corner'
import { useT, useUserPrefs } from '../lib/user-prefs'

const PRIMARY_NAV_IDS = [
  { id: 'home', route: paths.routes.home, labelKey: 'nav.home', icon: <NavIconOverview /> },
  {
    id: 'collections',
    route: paths.routes.collections,
    labelKey: 'nav.collections',
    icon: <NavIconOverview />,
  },
  { id: 'library', route: paths.routes.library, labelKey: 'nav.library', icon: <NavIconLibrary /> },
  { id: 'upload', route: paths.routes.upload, labelKey: 'nav.upload', icon: <NavIconUpload /> },
  {
    id: 'analyses',
    route: paths.routes.analyses,
    labelKey: 'nav.analyses',
    icon: <NavIconAnalyses />,
  },
  { id: 'cuts', route: paths.routes.cuts, labelKey: 'nav.cuts', icon: <NavIconCuts /> },
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
  const router = useRouter()
  const { data: session } = useSession()
  const { platformProjectId } = useActiveCollection()
  const { displayName: prefName } = useUserPrefs()
  const t = useT()
  const [railEdge, setRailEdge] = useState<RailDockEdge>(paths.railDockEdge)
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
        mainGutterRem: paths.mainGutterRem,
      }),
    [],
  )

  function isActive(route: string, href: string): boolean {
    if (route === paths.routes.home) return pathname === href
    return pathname === href.split('?')[0] || pathname.startsWith(href.split('?')[0])
  }

  const navItems = useMemo(
    () =>
      PRIMARY_NAV_IDS.map((item) => {
        const href = workspaceHref(item.route, platformProjectId)
        return {
          id: item.id,
          href,
          label: t(item.labelKey),
          icon: item.icon,
          active: isActive(item.route, href),
        }
      }),
    [pathname, platformProjectId, t],
  )

  return (
    <AppFrame
      railEdge={railEdge}
      style={frameStyle}
      backCorner={<ShellBackButton label={t('common.back')} onClick={() => router.back()} />}
      brandCorner={<ShellBrandCorner />}
      rail={
        <NavRail
          dockable
          dockStorageKey={paths.railDockStorageKey}
          defaultDockEdge={paths.railDockEdge}
          onDockEdgeChange={setRailEdge}
          logo={<MsqdxLogoMark size={26} title="MSQ DX" />}
          logoLabel={t('nav.homeAria', { brand: paths.brandLabel })}
          linkComponent={Link}
          items={navItems}
          footerItems={[
            {
              id: 'settings',
              label: t('nav.settings'),
              href: paths.routes.settings,
              active: pathname.startsWith(paths.routes.settings),
              ariaLabel: t('nav.settingsAria'),
              icon: <Avatar name={displayName} size="sm" className="rail-avatar" />,
            },
          ]}
        />
      }
    >
      <div className={`videon-stage${editor ? ' videon-stage--editor' : ' videon-stage--flush-top'}`}>
        {description && !editor ? <p className="videon-page-lead">{description}</p> : null}
        {children}
      </div>
    </AppFrame>
  )
}

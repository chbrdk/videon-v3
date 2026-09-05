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

const PRIMARY_NAV = [
  { id: 'home', route: paths.routes.home, label: 'Übersicht', icon: <NavIconOverview /> },
  { id: 'collections', route: paths.routes.collections, label: 'Collections', icon: <NavIconOverview /> },
  { id: 'library', route: paths.routes.library, label: 'Mediathek', icon: <NavIconLibrary /> },
  { id: 'upload', route: paths.routes.upload, label: 'Upload', icon: <NavIconUpload /> },
  { id: 'analyses', route: paths.routes.analyses, label: 'Analysen', icon: <NavIconAnalyses /> },
  { id: 'cuts', route: paths.routes.cuts, label: 'Cuts', icon: <NavIconCuts /> },
] as const

export function AppShell({
  children,
  description,
}: {
  children: ReactNode
  description?: string
  /** @deprecated Global page title removed — magazine heroes own identity. */
  title?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const { platformProjectId } = useActiveCollection()
  const [railEdge, setRailEdge] = useState<RailDockEdge>(paths.railDockEdge)
  const displayName = session?.user?.name?.trim() || session?.user?.email?.trim() || 'VIDEON'

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
      PRIMARY_NAV.map((item) => {
        const href = workspaceHref(item.route, platformProjectId)
        return {
          id: item.id,
          href,
          label: item.label,
          icon: item.icon,
          active: isActive(item.route, href),
        }
      }),
    [pathname, platformProjectId],
  )

  return (
    <AppFrame
      railEdge={railEdge}
      style={frameStyle}
      backCorner={<ShellBackButton label="Zurück" onClick={() => router.back()} />}
      brandCorner={<ShellBrandCorner />}
      rail={
        <NavRail
          dockable
          dockStorageKey={paths.railDockStorageKey}
          defaultDockEdge={paths.railDockEdge}
          onDockEdgeChange={setRailEdge}
          logo={<MsqdxLogoMark size={26} title="MSQ DX" />}
          logoLabel={`${paths.brandLabel} Übersicht`}
          linkComponent={Link}
          items={navItems}
          footerItems={[
            {
              id: 'settings',
              label: 'Einstellungen',
              href: paths.routes.settings,
              active: pathname.startsWith(paths.routes.settings),
              ariaLabel: 'Einstellungen',
              icon: <Avatar name={displayName} size="sm" className="rail-avatar" />,
            },
          ]}
        />
      }
    >
      <div className="videon-stage videon-stage--flush-top">
        {description ? <p className="videon-page-lead">{description}</p> : null}
        {children}
      </div>
    </AppFrame>
  )
}

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
import { NavIconAnalyses, NavIconCuts, NavIconLibrary, NavIconOverview } from './nav-icons'
import { paths } from '../lib/paths'
import { ShellBrandCorner } from './shell-brand-corner'

const PRIMARY_NAV = [
  { id: 'home', href: paths.routes.home, label: 'Übersicht', icon: <NavIconOverview /> },
  { id: 'library', href: paths.routes.library, label: 'Mediathek', icon: <NavIconLibrary /> },
  { id: 'analyses', href: paths.routes.analyses, label: 'Analysen', icon: <NavIconAnalyses /> },
  { id: 'cuts', href: paths.routes.cuts, label: 'Cuts', icon: <NavIconCuts /> },
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

  function isActive(href: string): boolean {
    return href === '/' ? pathname === href : pathname.startsWith(href)
  }

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
          items={PRIMARY_NAV.map((item) => ({
            id: item.id,
            href: item.href,
            label: item.label,
            icon: item.icon,
            active: isActive(item.href),
          }))}
          footerItems={[
            {
              id: 'settings',
              label: 'Einstellungen',
              href: paths.routes.settings,
              active: isActive(paths.routes.settings),
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

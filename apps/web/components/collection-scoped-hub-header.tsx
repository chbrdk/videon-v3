'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@msqdx/ui'
import { HubPageHeader } from '@/components/hub-page-header'
import { useAccessibleCollections } from '@/components/use-accessible-collections'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

/** Hub header with active Collection name as eyebrow + optional switcher action. */
export function CollectionScopedHubHeader({
  platformProjectId,
  title,
  deck,
  actions,
}: {
  platformProjectId: string
  title: string
  deck?: ReactNode
  actions?: ReactNode
}) {
  const t = useT()
  const { nameFor } = useAccessibleCollections()
  const name = nameFor(platformProjectId)
  const switcher = (
    <Link href={paths.routes.collections}>
      <Button variant="ghost">{t('nav.switchCollection')}</Button>
    </Link>
  )

  return (
    <HubPageHeader
      eyebrow={name || t('nav.collection')}
      title={title}
      deck={deck}
      actions={
        <>
          {actions}
          {switcher}
        </>
      }
    />
  )
}

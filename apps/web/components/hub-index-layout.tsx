'use client'

import { useEffect, useState } from 'react'
import {
  HubIndexLayoutSwitch as DsHubIndexLayoutSwitch,
  type HubIndexLayout,
} from '@msqdx/ui'
import { paths } from '@/lib/paths'

export type { HubIndexLayout }

export function readHubIndexLayout(): HubIndexLayout {
  if (typeof window === 'undefined') return 'cards'
  try {
    const raw = window.sessionStorage.getItem(paths.hubIndexLayoutKey)
    return raw === 'list' ? 'list' : 'cards'
  } catch {
    return 'cards'
  }
}

export function writeHubIndexLayout(next: HubIndexLayout): void {
  try {
    window.sessionStorage.setItem(paths.hubIndexLayoutKey, next)
  } catch {
    /* ignore */
  }
}

export function useHubIndexLayout(): {
  layout: HubIndexLayout
  setLayout: (next: HubIndexLayout) => void
} {
  const [layout, setLayoutState] = useState<HubIndexLayout>('cards')

  useEffect(() => {
    setLayoutState(readHubIndexLayout())
  }, [])

  function setLayout(next: HubIndexLayout) {
    setLayoutState(next)
    writeHubIndexLayout(next)
  }

  return { layout, setLayout }
}

export function HubIndexLayoutSwitch({
  layout,
  onChange,
}: {
  layout: HubIndexLayout
  onChange: (next: HubIndexLayout) => void
}) {
  return (
    <DsHubIndexLayoutSwitch
      value={layout}
      onChange={onChange}
      aria-label="Layout"
      cardsLabel="Karten"
      listLabel="Liste"
    />
  )
}

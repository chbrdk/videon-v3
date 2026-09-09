'use client'

import { createContext, useContext, type ReactNode } from 'react'

const TopbarTrailHostContext = createContext<HTMLElement | null>(null)

/** AppShell provides the DOM host for product topbar trail content (CREATION P68). */
export function TopbarTrailHostProvider({
  host,
  children,
}: {
  host: HTMLElement | null
  children: ReactNode
}) {
  return (
    <TopbarTrailHostContext.Provider value={host}>{children}</TopbarTrailHostContext.Provider>
  )
}

/** Immersive editors portal tools into the AppShell trail when present. */
export function useTopbarTrailHost(): HTMLElement | null {
  return useContext(TopbarTrailHostContext)
}

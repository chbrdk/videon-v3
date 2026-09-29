'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { usePathname } from 'next/navigation'
import {
  buildCollectionAssistantPageContext,
  type AssistantPageContext,
} from '../lib/assistant-page-context'

type AssistantPageContextValue = {
  pageContext: AssistantPageContext | null
  setPageContext: (next: AssistantPageContext | null) => void
}

const AssistantPageContextReact = createContext<AssistantPageContextValue | null>(null)

export function AssistantPageContextProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<AssistantPageContext | null>(null)
  const setPageContext = useCallback((next: AssistantPageContext | null) => {
    setPageContextState((prev) => {
      if (prev === next) return prev
      if (!prev && !next) return prev
      if (
        prev &&
        next &&
        prev.product === next.product &&
        prev.pathname === next.pathname &&
        prev.capability === next.capability &&
        prev.platformProjectId === next.platformProjectId &&
        prev.entityType === next.entityType &&
        prev.entityId === next.entityId &&
        prev.entityUpdatedAt === next.entityUpdatedAt
      ) {
        return prev
      }
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ pageContext, setPageContext }),
    [pageContext, setPageContext],
  )

  return (
    <AssistantPageContextReact.Provider value={value}>{children}</AssistantPageContextReact.Provider>
  )
}

export function useAssistantPageContext(): AssistantPageContext | null {
  return useContext(AssistantPageContextReact)?.pageContext ?? null
}

export function useSetAssistantPageContext(): (next: AssistantPageContext | null) => void {
  const ctx = useContext(AssistantPageContextReact)
  return ctx?.setPageContext ?? (() => undefined)
}

/**
 * Mount on Collection-bound surfaces. Publishes into the host flyout bus;
 * clears on unmount. Spec: plexon-v3/specs/domain/assistant-page-context.md
 */
export function AssistantPageContextPublisher({
  platformProjectId,
  capability,
  entityType,
  entityId,
}: {
  platformProjectId?: string | null
  capability?: string | null
  entityType?: string | null
  entityId?: string | null
}) {
  const setPageContext = useSetAssistantPageContext()
  const pathname = usePathname()

  useEffect(() => {
    setPageContext(
      buildCollectionAssistantPageContext({
        pathname: pathname ?? '/',
        platformProjectId,
        capability,
        entityType,
        entityId,
      }),
    )
    return () => setPageContext(null)
  }, [pathname, platformProjectId, capability, entityType, entityId, setPageContext])

  return null
}

'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ACTIVE_COLLECTION_STORAGE_KEY,
  readStoredPlatformProjectId,
  writeStoredPlatformProjectId,
} from '@/lib/collection-context'

type CollectionContextValue = {
  platformProjectId: string | null
  setPlatformProjectId: (platformProjectId: string) => void
}

const CollectionContext = createContext<CollectionContextValue | null>(null)

export function CollectionContextProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams()
  const [platformProjectId, setState] = useState<string | null>(null)

  useEffect(() => {
    setState(readStoredPlatformProjectId())
  }, [])

  useEffect(() => {
    const fromUrl = searchParams.get('platformProjectId')?.trim()
    if (!fromUrl) return
    writeStoredPlatformProjectId(fromUrl)
    setState(fromUrl)
  }, [searchParams])

  const setPlatformProjectId = useCallback((next: string) => {
    writeStoredPlatformProjectId(next)
    setState(next.trim())
  }, [])

  const value = useMemo(
    () => ({
      platformProjectId,
      setPlatformProjectId,
    }),
    [platformProjectId, setPlatformProjectId],
  )

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>
}

export function useActiveCollection(): CollectionContextValue {
  const context = useContext(CollectionContext)
  if (!context) {
    return {
      platformProjectId: readStoredPlatformProjectId(),
      setPlatformProjectId: writeStoredPlatformProjectId,
    }
  }
  return context
}

export { ACTIVE_COLLECTION_STORAGE_KEY }

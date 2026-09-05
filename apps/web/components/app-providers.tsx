'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Suspense } from 'react'
import { CollectionContextProvider } from '@/components/collection-context'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Suspense fallback={children}>
        <CollectionContextProvider>{children}</CollectionContextProvider>
      </Suspense>
    </SessionProvider>
  )
}

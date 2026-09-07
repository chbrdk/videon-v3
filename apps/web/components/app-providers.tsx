'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Suspense } from 'react'
import { CollectionContextProvider } from '@/components/collection-context'
import { ToastProvider } from '@msqdx/ui-client'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <Suspense fallback={children}>
          <CollectionContextProvider>{children}</CollectionContextProvider>
        </Suspense>
      </ToastProvider>
    </SessionProvider>
  )
}

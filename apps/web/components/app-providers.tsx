'use client'

import type { ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { Suspense } from 'react'
import { CollectionContextProvider } from '@/components/collection-context'
import { ToastProvider } from '@msqdx/ui-client'
import { UserPrefsProvider } from '@/lib/user-prefs'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <UserPrefsProvider>
        <ToastProvider>
          <Suspense fallback={children}>
            <CollectionContextProvider>{children}</CollectionContextProvider>
          </Suspense>
        </ToastProvider>
      </UserPrefsProvider>
    </SessionProvider>
  )
}

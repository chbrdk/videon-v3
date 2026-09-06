import type { Metadata } from 'next'
import './globals.css'
import { paths } from '@/lib/paths'
import { AppProviders } from '@/components/app-providers'

export const metadata: Metadata = {
  title: 'VIDEON v3',
  description: 'Collection-bound video intelligence for PLEXON',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={paths.defaultLocale} data-theme={paths.defaultTheme} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

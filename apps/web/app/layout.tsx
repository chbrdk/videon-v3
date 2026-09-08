import type { Metadata } from 'next'
import { resolveThemeId } from '@msqdx/ui'
import './globals.css'
import { paths } from '@/lib/paths'
import { AppProviders } from '@/components/app-providers'

export const metadata: Metadata = {
  title: 'VIDEON v3',
  description: 'Project-bound video intelligence for PLEXON',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang={paths.defaultLocale}
      data-theme={resolveThemeId(paths.defaultTheme)}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}

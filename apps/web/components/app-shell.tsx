import Link from 'next/link'
import type { ReactNode } from 'react'
import { Button, SectionChrome, Text } from '@msqdx/ui'
import { pathLibrary } from '@/lib/paths'

export function AppShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="videon-page">
      <SectionChrome
        title={title}
        meta={<Text role="meta">VIDEON · Collection capability</Text>}
      />
      <Text role="body" as="p">
        {description}
      </Text>
      <nav className="videon-page__actions" aria-label="VIDEON navigation">
        <Link href={pathLibrary}>Mediathek</Link>
        <Button type="button" variant="primary" disabled>
          Upload kommt mit Storage-Gate
        </Button>
      </nav>
      {children}
    </main>
  )
}

'use client'

import { HubPageHeader } from '@/components/hub-page-header'
import { MediaLibrary } from '@/components/media-library'
import { paths } from '@/lib/paths'
import { useT } from '@/lib/user-prefs'

/** Mediathek — all accessible projects by default; optional project filter via query. */
export function LibraryWorkspace({ platformProjectId }: { platformProjectId?: string }) {
  const t = useT()
  const scoped = Boolean(platformProjectId?.trim())
  return (
    <article className="videon-hub videon-hub--wide">
      <HubPageHeader
        eyebrow={scoped ? t('nav.collection') : t('nav.library')}
        title={t('nav.library')}
        deck={scoped ? t('library.deckScoped') : t('library.deck')}
      />
      <MediaLibrary platformProjectId={platformProjectId?.trim() || undefined} />
    </article>
  )
}

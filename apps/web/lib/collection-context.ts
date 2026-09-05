import { paths } from '@/lib/paths'

export const ACTIVE_COLLECTION_STORAGE_KEY = 'videon.v3.activePlatformProjectId'

export function readStoredPlatformProjectId(): string | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(ACTIVE_COLLECTION_STORAGE_KEY)?.trim()
  return value || null
}

export function writeStoredPlatformProjectId(platformProjectId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_COLLECTION_STORAGE_KEY, platformProjectId.trim())
}

export function clearStoredPlatformProjectId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ACTIVE_COLLECTION_STORAGE_KEY)
}

export function workspaceHref(route: string, platformProjectId: string | null | undefined): string {
  if (!platformProjectId) return route
  switch (route) {
    case paths.routes.library:
      return paths.routes.libraryFor(platformProjectId)
    case paths.routes.upload:
      return paths.routes.uploadFor(platformProjectId)
    case paths.routes.analyses:
      return paths.routes.analysesFor(platformProjectId)
    case paths.routes.cuts:
      return paths.routes.cutsFor(platformProjectId)
    default:
      return route
  }
}

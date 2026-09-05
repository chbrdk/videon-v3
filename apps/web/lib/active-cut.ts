export const ACTIVE_CUT_STORAGE_KEY = 'videon.v3.activeCut'

export type ActiveCutContext = {
  cutId: string
  platformProjectId: string
  name: string
}

export function readStoredActiveCut(): ActiveCutContext | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(ACTIVE_CUT_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ActiveCutContext
    if (!parsed?.cutId || !parsed?.platformProjectId) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredActiveCut(input: ActiveCutContext): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACTIVE_CUT_STORAGE_KEY, JSON.stringify(input))
}

export function clearStoredActiveCut(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(ACTIVE_CUT_STORAGE_KEY)
}

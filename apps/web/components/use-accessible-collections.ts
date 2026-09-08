'use client'

import { useEffect, useMemo, useState } from 'react'
import { paths } from '@/lib/paths'

export type AccessibleCollection = {
  id: string
  name: string
  status: string
  companyId: string
  domain: string | null
}

/**
 * Loads Access Model B Collections once for chrome (name resolve + switcher).
 */
export function useAccessibleCollections() {
  const [items, setItems] = useState<AccessibleCollection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(paths.routes.apiCollections, { cache: 'no-store' })
        const body = (await response.json()) as {
          items?: AccessibleCollection[]
          error?: { message?: string }
        }
        if (!response.ok) {
          throw new Error(body.error?.message || 'Collections konnten nicht geladen werden')
        }
        if (!cancelled) setItems(body.items ?? [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items ?? []) map.set(item.id, item.name)
    return map
  }, [items])

  function nameFor(platformProjectId: string | null | undefined): string | null {
    if (!platformProjectId) return null
    return nameById.get(platformProjectId) ?? null
  }

  return { items, loading, error, nameFor }
}

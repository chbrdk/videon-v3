'use client'

import { useEffect, useState } from 'react'
import { loadFramePosterBlobUrl } from '@/lib/media-frame-poster'

/** Load a Frame API URL through the shared concurrency gate (≤ 4). */
export function useFramePoster(frameUrl: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!frameUrl) {
      setSrc(null)
      return
    }
    let cancelled = false
    void loadFramePosterBlobUrl(frameUrl)
      .then((url) => {
        if (!cancelled) setSrc(url)
      })
      .catch(() => {
        if (!cancelled) setSrc(null)
      })
    return () => {
      cancelled = true
    }
  }, [frameUrl])

  return src
}

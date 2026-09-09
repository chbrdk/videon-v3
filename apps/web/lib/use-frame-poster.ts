'use client'

import { useEffect, useState } from 'react'
import { loadFramePosterBlobUrl } from '@/lib/media-frame-poster'

export type FramePosterStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Load a Frame API URL through the shared concurrency gate (≤ 4). */
export function useFramePoster(frameUrl: string | null): {
  src: string | null
  status: FramePosterStatus
} {
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<FramePosterStatus>('idle')

  useEffect(() => {
    if (!frameUrl) {
      setSrc(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('loading')
    setSrc(null)
    void loadFramePosterBlobUrl(frameUrl)
      .then((url) => {
        if (cancelled) return
        setSrc(url)
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setSrc(null)
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [frameUrl])

  return { src, status }
}

'use client'

import { useEffect, useState } from 'react'
import { downsamplePeaks } from '@/lib/editor-time'

const waveformCache = new Map<string, number[]>()

async function decodeWaveformPeaks(audioUrl: string, buckets = 240): Promise<number[]> {
  const cached = waveformCache.get(audioUrl)
  if (cached) return cached

  const response = await fetch(audioUrl)
  if (!response.ok) throw new Error('Waveform konnte nicht geladen werden')
  const buffer = await response.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(buffer.slice(0))
    const channel = decoded.getChannelData(0)
    const peaks = downsamplePeaks(channel, buckets)
    waveformCache.set(audioUrl, peaks)
    return peaks
  } finally {
    await audioContext.close()
  }
}

export function useWaveformPeaks(audioUrl: string | null, buckets = 240): {
  peaks: number[]
  loading: boolean
  error: string | null
} {
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!audioUrl) {
      setPeaks([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void decodeWaveformPeaks(audioUrl, buckets)
      .then((next) => {
        if (!cancelled) setPeaks(next)
      })
      .catch((err) => {
        if (!cancelled) {
          setPeaks([])
          setError(err instanceof Error ? err.message : 'Waveform fehlgeschlagen')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [audioUrl, buckets])

  return { peaks, loading, error }
}

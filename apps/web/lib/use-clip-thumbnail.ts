'use client'

import { useEffect, useState } from 'react'

const thumbnailCache = new Map<string, string>()

async function captureThumbnail(videoUrl: string, atMs: number): Promise<string | null> {
  const bucketMs = Math.round(atMs / 250) * 250
  const cacheKey = `${videoUrl}@${bucketMs}`
  const cached = thumbnailCache.get(cacheKey)
  if (cached) return cached

  const sameOrigin =
    videoUrl.startsWith('/') ||
    (typeof window !== 'undefined' &&
      (videoUrl.startsWith(window.location.origin) || videoUrl.startsWith(`${window.location.origin}/`)))

  return new Promise((resolve) => {
    const video = document.createElement('video')
    if (!sameOrigin) video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true

    const cleanup = () => {
      video.removeAttribute('src')
      video.load()
    }

    const onError = () => {
      cleanup()
      resolve(null)
    }

    video.addEventListener('error', onError, { once: true })
    video.addEventListener(
      'loadeddata',
      () => {
        const seekTo = Math.max(0, bucketMs / 1000)
        const onSeeked = () => {
          try {
            const canvas = document.createElement('canvas')
            canvas.width = 160
            canvas.height = 90
            const context = canvas.getContext('2d')
            if (!context || video.videoWidth <= 0) {
              cleanup()
              resolve(null)
              return
            }
            const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
            const width = video.videoWidth * scale
            const height = video.videoHeight * scale
            context.fillStyle = '#000'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
            thumbnailCache.set(cacheKey, dataUrl)
            cleanup()
            resolve(dataUrl)
          } catch {
            cleanup()
            resolve(null)
          }
        }
        video.addEventListener('seeked', onSeeked, { once: true })
        video.currentTime = Math.min(seekTo, Math.max(video.duration - 0.05, 0))
      },
      { once: true },
    )

    video.src = videoUrl
  })
}

export function useClipThumbnail(videoUrl: string | null, atMs: number): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  useEffect(() => {
    if (!videoUrl) {
      setThumbnail(null)
      return
    }
    let cancelled = false
    void captureThumbnail(videoUrl, atMs).then((url) => {
      if (!cancelled) setThumbnail(url)
    })
    return () => {
      cancelled = true
    }
  }, [atMs, videoUrl])

  return thumbnail
}

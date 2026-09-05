'use client'

import { useClipThumbnail } from '@/lib/use-clip-thumbnail'

export function TimelineClipThumbnail({
  playbackUrl,
  sourceMs,
}: {
  playbackUrl: string | null
  sourceMs: number
}) {
  const thumbnail = useClipThumbnail(playbackUrl, sourceMs)
  if (!thumbnail) return <div className="videon-cut-timeline__clip-thumb videon-cut-timeline__clip-thumb--empty" />
  return (
    <div
      className="videon-cut-timeline__clip-thumb"
      style={{ backgroundImage: `url(${thumbnail})` }}
      aria-hidden="true"
    />
  )
}

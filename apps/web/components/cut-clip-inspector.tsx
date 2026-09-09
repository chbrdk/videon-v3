'use client'

import { useEffect, useState } from 'react'
import { Button, Field, Input, InspectSection, PropertyInspector, Text } from '@msqdx/ui'
import { formatClock } from '@/lib/editor-time'

type CutClipInspectorProps = {
  clip: {
    scene: { id: string; startMs: number; endMs: number; mediaAssetId: string }
    media: { originalFilename: string; durationMs?: number | null } | null
  } | null
  busy?: boolean
  onApplyTrim: (sceneId: string, startMs: number, endMs: number) => void
}

export function CutClipInspector({ clip, busy = false, onApplyTrim }: CutClipInspectorProps) {
  const [startMs, setStartMs] = useState('')
  const [endMs, setEndMs] = useState('')

  useEffect(() => {
    if (!clip) {
      setStartMs('')
      setEndMs('')
      return
    }
    setStartMs(String(clip.scene.startMs))
    setEndMs(String(clip.scene.endMs))
  }, [clip?.scene.id, clip?.scene.startMs, clip?.scene.endMs])

  if (!clip) {
    return (
      <PropertyInspector title="Clip" emptyLabel="Clip in der Timeline wählen" aria-label="Clip-Eigenschaften" />
    )
  }

  const duration = Math.max(0, clip.scene.endMs - clip.scene.startMs)

  return (
    <PropertyInspector title="Clip" emptyLabel="Clip wählen" aria-label="Clip-Eigenschaften">
      <InspectSection title="Media">
        <Text role="body">{clip.media?.originalFilename ?? clip.scene.mediaAssetId}</Text>
        {clip.media?.durationMs != null ? (
          <Text role="meta">Quelle · {formatClock(clip.media.durationMs)}</Text>
        ) : null}
      </InspectSection>
      <InspectSection title="In / Out">
        <Field label="In (ms)">
          <Input
            type="number"
            min={0}
            value={startMs}
            disabled={busy}
            onChange={(event) => setStartMs(event.target.value)}
          />
        </Field>
        <Field label="Out (ms)">
          <Input
            type="number"
            min={0}
            value={endMs}
            disabled={busy}
            onChange={(event) => setEndMs(event.target.value)}
          />
        </Field>
        <Text role="meta">Dauer · {formatClock(duration)}</Text>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => {
            const nextStart = Number.parseInt(startMs, 10)
            const nextEnd = Number.parseInt(endMs, 10)
            if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) return
            onApplyTrim(clip.scene.id, nextStart, nextEnd)
          }}
        >
          Trim anwenden
        </Button>
      </InspectSection>
    </PropertyInspector>
  )
}

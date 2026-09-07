'use client'

import type { ReactNode } from 'react'
import { Button, Chip, StatusDot, Text, type StatusLevel } from '@msqdx/ui'

export function EditorStatusStrip({
  level = 'ok',
  label,
  detail,
  actionLabel,
  onAction,
}: {
  level?: StatusLevel
  label: ReactNode
  detail?: ReactNode
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="videon-nle__status-strip" role="status">
      <div className="videon-nle__status-strip-main">
        <StatusDot level={level} />
        <Chip static size="sm">
          {label}
        </Chip>
        {detail != null ? (
          <Text role="meta" as="span">
            {detail}
          </Text>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button type="button" variant="ghost" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function analysisStatusLevel(status: string | null | undefined): StatusLevel {
  if (status === 'failed') return 'critical'
  if (status === 'running' || status === 'queued' || status === 'processing') return 'warn'
  return 'ok'
}

export function exportStatusLevel(status: string | null | undefined): StatusLevel {
  if (status === 'failed') return 'critical'
  if (status === 'queued' || status === 'running') return 'warn'
  return 'ok'
}

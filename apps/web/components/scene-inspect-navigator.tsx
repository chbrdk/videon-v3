'use client'

import { Badge, Chip, StatusDot, Text, Timecode, type BadgeTone, type StatusLevel } from '@msqdx/ui'
import type { BrandCheckView } from '@/lib/brand-findings'
import type { BrandCheckStatus } from '@/lib/db/brand-checks'
import { formatClock } from '@/lib/editor-time'
import { timelineClipLabel } from '@/lib/timeline-clip-label'

const NAV_LABEL_MAX = 72

const BRAND_STATUS_LABELS: Record<BrandCheckStatus | 'unchecked', string> = {
  unchecked: 'ungeprüft',
  queued_pending_brandion: 'wartet',
  running: 'läuft',
  pass: 'pass',
  warn: 'warn',
  fail: 'fail',
  skipped: 'skip',
}

function brandStatusLevel(status: BrandCheckStatus | 'unchecked'): StatusLevel {
  if (status === 'fail') return 'critical'
  if (status === 'pass') return 'ok'
  if (status === 'warn' || status === 'running' || status === 'queued_pending_brandion') return 'warn'
  return 'warn'
}

function brandBadgeTone(status: BrandCheckStatus | 'unchecked'): BadgeTone {
  if (status === 'fail') return 'danger'
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'neutral'
}

export type SceneInspectNavItem = {
  sceneKey: string
  summary: string
  startMs: number
  endMs: number
  brand?: BrandCheckView | null
}

type Props = {
  scenes: SceneInspectNavItem[]
  activeSceneKey: string | null
  onSelect: (sceneKey: string, startMs: number) => void
}

/** Compact scene list for the inspect drawer — full summary lives in the detail pane. */
export function SceneInspectNavigator({ scenes, activeSceneKey, onSelect }: Props) {
  if (scenes.length === 0) return null

  return (
    <ul className="videon-scene-inspect__nav" data-testid="scene-inspect-navigator">
      {scenes.map((scene, index) => {
        const brandStatus = scene.brand?.status ?? 'unchecked'
        const label =
          timelineClipLabel(scene.summary, NAV_LABEL_MAX) || `Szene ${index + 1}`
        return (
          <li key={scene.sceneKey}>
            <button
              type="button"
              className={`videon-scene-inspect__nav-item${
                activeSceneKey === scene.sceneKey ? ' is-active' : ''
              }`}
              title={scene.summary}
              onClick={() => onSelect(scene.sceneKey, scene.startMs)}
            >
              <Text role="body" as="span" className="videon-scene-inspect__nav-title">
                {label}
              </Text>
              <span className="videon-scene-inspect__nav-meta">
                <Timecode
                  value={formatClock(scene.startMs)}
                  secondary={formatClock(scene.endMs)}
                  separator="–"
                />
                <span className="videon-scene-inspect__nav-brand">
                  <StatusDot level={brandStatusLevel(brandStatus)} />
                  <Chip static size="sm">
                    {BRAND_STATUS_LABELS[brandStatus]}
                  </Chip>
                  {scene.brand && (scene.brand.failed > 0 || scene.brand.passed > 0) ? (
                    <Badge tone={brandBadgeTone(brandStatus)}>
                      {scene.brand.passed}/{scene.brand.failed}
                    </Badge>
                  ) : null}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

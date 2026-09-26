import type { BadgeTone } from '@msqdx/ui'
import type { StatusLevel } from '@msqdx/ui'

/** Map legacy StatusDot levels to Badge tones (keep-drop: status → Badge). */
export function statusLevelToBadgeTone(level: StatusLevel): BadgeTone {
  if (level === 'critical') return 'danger'
  if (level === 'warn') return 'warning'
  return 'success'
}

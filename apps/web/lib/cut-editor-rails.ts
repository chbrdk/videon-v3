/**
 * Cut editor docked rail sizes — specs/domain/videon-ui-surfaces.md Wave B
 */

export const CUT_LEFT_RAIL_KEY = 'videon.cut.leftRailPx'
export const CUT_RIGHT_RAIL_KEY = 'videon.cut.rightRailPx'
export const CUT_LEFT_OPEN_KEY = 'videon.cut.leftRailOpen'
export const CUT_RIGHT_OPEN_KEY = 'videon.cut.rightRailOpen'

export const CUT_RAIL_LIMITS = {
  min: 220,
  max: 480,
  leftDefault: 280,
  rightDefault: 300,
} as const

function clamp(px: number): number {
  return Math.min(CUT_RAIL_LIMITS.max, Math.max(CUT_RAIL_LIMITS.min, Math.round(px)))
}

export function readCutRailWidth(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = window.sessionStorage.getItem(key)
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) ? clamp(parsed) : fallback
}

export function writeCutRailWidth(key: string, px: number): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, String(clamp(px)))
}

export function readCutRailOpen(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback
  const raw = window.sessionStorage.getItem(key)
  if (raw === '0') return false
  if (raw === '1') return true
  return fallback
}

export function writeCutRailOpen(key: string, open: boolean): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(key, open ? '1' : '0')
}

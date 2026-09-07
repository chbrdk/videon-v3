import { describe, expect, it } from 'vitest'
import { timelineClipLabel } from '@/lib/timeline-clip-label'

/** Mirrors SceneInspectNavigator NAV_LABEL_MAX (Wave D). */
const SCENE_INSPECT_NAV_MAX = 72

describe('scenes inspect navigator labels', () => {
  it('truncates long GenCut-style summaries for the drawer list', () => {
    const summary =
      "Das Video zeigt eine Werbeanzeige für 'GenCut', eine Videoautomatisierungs-Software. Zuerst erscheint der Markenname auf einem rot-orangen Gradient-Hintergrund. Danach wird eine Benutzeroberfläche ein"
    const label = timelineClipLabel(summary, SCENE_INSPECT_NAV_MAX)
    expect(label.length).toBeLessThanOrEqual(SCENE_INSPECT_NAV_MAX)
    expect(label.endsWith('…')).toBe(true)
    expect(label).not.toContain('Benutzeroberfläche')
  })

  it('keeps short summaries intact', () => {
    expect(timelineClipLabel('Logo reveal', SCENE_INSPECT_NAV_MAX)).toBe('Logo reveal')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { statusLevelToBadgeTone } from '../lib/status-badge-tone'

describe('status Badge reshape', () => {
  it('maps StatusLevel to BadgeTone', () => {
    expect(statusLevelToBadgeTone('ok')).toBe('success')
    expect(statusLevelToBadgeTone('warn')).toBe('warning')
    expect(statusLevelToBadgeTone('critical')).toBe('danger')
  })

  it('editor/pipeline/scene status surfaces use Badge not StatusDot+Chip', () => {
    const files = [
      'components/editor-status-strip.tsx',
      'components/pipeline-status-track.tsx',
      'components/scene-inspect-navigator.tsx',
      'components/scene-insight-inspector.tsx',
    ]
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8')
      expect(src, rel).not.toContain('StatusDot')
      expect(src, rel).toContain('Badge')
    }
    const pipeline = readFileSync(join(process.cwd(), 'components/pipeline-status-track.tsx'), 'utf8')
    expect(pipeline).not.toMatch(/Chip\s+static/)
    const strip = readFileSync(join(process.cwd(), 'components/editor-status-strip.tsx'), 'utf8')
    expect(strip).not.toMatch(/Chip\s+static/)
  })
})

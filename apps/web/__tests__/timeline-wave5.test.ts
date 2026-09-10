import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('cut timeline edit wave 5', () => {
  it('wires ripple resize helper into editor trim paths', () => {
    const editor = readFileSync(join(__dirname, '../components/cut-editor-view.tsx'), 'utf8')
    const ripple = readFileSync(join(__dirname, '../lib/timeline-ripple.ts'), 'utf8')
    const spec = readFileSync(
      join(__dirname, '../../../specs/domain/cut-timeline-edit-ux-wave5.md'),
      'utf8',
    )
    expect(ripple).toContain('rippleMovesAfterResize')
    expect(editor).toContain('applyResizeTrimWithRipple')
    expect(editor).toContain('rippleMovesAfterResize')
    expect(spec).toContain('Δend')
    expect(spec).toContain('multilayer undo snapshot')
  })
})

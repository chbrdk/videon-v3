import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('NLE theme tokens (no parallel hex palette)', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')
  const nleBlock =
    css.match(/\.videon-nle\s*\{[^}]*--nle-bg:[\s\S]*?\n\}/)?.[0] ?? ''

  it('defines nle aliases from theme vars without hex fallbacks', () => {
    expect(nleBlock.length).toBeGreaterThan(80)
    expect(nleBlock).toContain('--nle-bg: var(--bg0')
    expect(nleBlock).toContain('--nle-playhead: var(--accent)')
    expect(nleBlock).toContain('--nle-void: var(--ink)')
    expect(nleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('does not hardcode former palette hexes as nle-playhead fallbacks', () => {
    expect(css).not.toContain('var(--nle-playhead, #ff6b00)')
    expect(css).not.toContain('var(--nle-clip, #2f5f8f)')
    expect(css).not.toContain('background: #000;')
  })
})

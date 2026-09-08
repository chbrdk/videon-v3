import { describe, expect, it } from 'vitest'
import { buildSceneSearchPlan } from '@/lib/scene-search-query'

describe('buildSceneSearchPlan', () => {
  it('strips German NL filler and expands dashboard / UI concepts', () => {
    const plan = buildSceneSearchPlan(
      'ich suche ein szene die dashbaords web interfaces darstellt',
    )
    expect(plan.terms).toContain('dashboard')
    expect(plan.terms).toContain('interface')
    expect(plan.terms).toContain('ui')
    expect(plan.terms).not.toContain('ich')
    expect(plan.terms).not.toContain('szene')
    expect(plan.tsQuery).toMatch(/dashboard:\*/)
    expect(plan.likePatterns.some((p) => p.includes('dashboard'))).toBe(true)
  })

  it('returns empty plan for stopwords-only input', () => {
    const plan = buildSceneSearchPlan('ich suche eine szene')
    expect(plan.terms.length).toBe(0)
    expect(plan.tsQuery).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { recommendCreateModelId, recommendEditModelId } from '@/lib/generation/recommend'

describe('generation recommend', () => {
  it('defaults edit to Seedance Mini', () => {
    expect(recommendEditModelId({ prompt: 'change the car to a Ford Escort' })).toBe(
      'seedance_2_0_mini_edit',
    )
  })

  it('picks Aleph for keyframe prompts when available', () => {
    expect(
      recommendEditModelId({
        prompt: 'exact frame keyframe replace logo',
        alephAvailable: true,
      }),
    ).toBe('runway_aleph_2')
    expect(
      recommendEditModelId({
        prompt: 'exact frame keyframe replace logo',
        alephAvailable: false,
      }),
    ).toBe('seedance_2_0_mini_edit')
  })

  it('picks Veo for photoreal create', () => {
    expect(recommendCreateModelId('cinematic photoreal hero shot')).toBe('veo_3_1_create')
    expect(recommendCreateModelId('veo lite volume create')).toBe('veo_3_1_lite_create')
    expect(recommendCreateModelId('simple product loop')).toBe('seedance_2_5_t2v')
  })

  it('picks Wan and MiniMax from create keywords', () => {
    expect(recommendCreateModelId('wan story long clip')).toBe('wan_3_0_create')
    expect(recommendCreateModelId('minimax hailuo fast create')).toBe('minimax_hailuo_3_create')
  })

  it('picks MiniMax edit for brand/text/quality prompts', () => {
    expect(recommendEditModelId({ prompt: 'add brand text logo overlay hailuo' })).toBe(
      'minimax_hailuo_3_edit',
    )
    expect(recommendEditModelId({ prompt: 'high quality motion transfer' })).toBe(
      'minimax_hailuo_3_edit',
    )
  })
})

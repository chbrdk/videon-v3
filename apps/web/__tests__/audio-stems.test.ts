import { describe, expect, it } from 'vitest'
import { resolveStemMethod } from '@/lib/pipeline/audio-stems'
import { STEM_DEMUCS_CAPABILITY } from '@/lib/pipeline/constants'

describe('stem method resolution', () => {
  it('defaults to ffmpeg mid/side', () => {
    expect(resolveStemMethod(undefined)).toBe('ffmpeg_mid_side')
    expect(resolveStemMethod([])).toBe('ffmpeg_mid_side')
    expect(resolveStemMethod(['vision'])).toBe('ffmpeg_mid_side')
  })

  it('selects demucs only when capability is requested', () => {
    expect(resolveStemMethod([STEM_DEMUCS_CAPABILITY])).toBe('demucs')
    expect(resolveStemMethod(['vision', STEM_DEMUCS_CAPABILITY])).toBe('demucs')
  })
})

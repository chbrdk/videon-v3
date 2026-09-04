import { afterEach, describe, expect, it } from 'vitest'
import { defaultVisionLane, directVideoVisionLane, openRouterProviderPolicy, schemaFallbackVisionLane } from '@/lib/vision-policy'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('vision policy', () => {
  it('uses Qwen3.7 Flash for the default bounded-frame lane', () => {
    process.env.VIDEON_VISION_DEFAULT_MODEL = 'qwen/qwen3.7-flash'
    expect(defaultVisionLane()).toMatchObject({
      model: 'qwen/qwen3.7-flash',
      inputMode: 'frames',
      responseMode: 'json_object',
      localSchemaValidation: true,
    })
  })

  it('keeps strict JSON schema on the independent fallback lane', () => {
    process.env.VIDEON_VISION_SCHEMA_FALLBACK_MODEL = 'qwen/qwen3-vl-30b-a3b-instruct'
    expect(schemaFallbackVisionLane()).toMatchObject({
      model: 'qwen/qwen3-vl-30b-a3b-instruct',
      responseMode: 'json_schema',
      providerRequireParameters: true,
    })
  })

  it('does not enable direct video without an explicit flag', () => {
    process.env.VIDEON_VISION_DEFAULT_MODEL = 'qwen/qwen3.7-flash'
    delete process.env.VIDEON_VISION_DIRECT_VIDEO_ENABLED
    expect(directVideoVisionLane()).toBeNull()
    process.env.VIDEON_VISION_DIRECT_VIDEO_ENABLED = 'true'
    expect(directVideoVisionLane()).toMatchObject({ inputMode: 'video' })
  })

  it('fails closed on provider data collection', () => {
    process.env.VIDEON_OPENROUTER_DATA_COLLECTION = 'deny'
    expect(openRouterProviderPolicy()).toEqual({ dataCollection: 'deny', zdr: false })
    process.env.VIDEON_OPENROUTER_DATA_COLLECTION = 'allow'
    expect(() => openRouterProviderPolicy()).toThrow('must be deny')
  })
})

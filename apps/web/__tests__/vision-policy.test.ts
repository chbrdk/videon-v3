import { afterEach, describe, expect, it } from 'vitest'
import { defaultVisionLane, directVideoVisionLane, openRouterProviderPolicy, schemaFallbackVisionLane, strictSchemaFallbackVisionLane } from '@/lib/vision-policy'
import { visionUsesIndependentFallbackModel } from '@/lib/runtime-config'

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

  it('retries the default model with strict JSON Schema before any optional override', () => {
    process.env.VIDEON_VISION_DEFAULT_MODEL = 'qwen/qwen3.7-flash'
    delete process.env.VIDEON_VISION_SCHEMA_FALLBACK_MODEL
    expect(schemaFallbackVisionLane()).toMatchObject({
      model: 'qwen/qwen3.7-flash',
      responseMode: 'json_schema',
      providerRequireParameters: false,
    })
    expect(strictSchemaFallbackVisionLane()).toBeNull()
  })

  it('allows an optional independent strict-schema evaluation lane', () => {
    process.env.VIDEON_VISION_DEFAULT_MODEL = 'qwen/qwen3.7-flash'
    process.env.VIDEON_VISION_SCHEMA_FALLBACK_MODEL = 'qwen/qwen3-vl-30b-a3b-instruct'
    expect(strictSchemaFallbackVisionLane()).toMatchObject({
      model: 'qwen/qwen3-vl-30b-a3b-instruct',
      responseMode: 'json_schema',
      providerRequireParameters: true,
    })
    expect(visionUsesIndependentFallbackModel()).toBe(true)
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

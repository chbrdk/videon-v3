import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mediaGenerationCreateStorageKey, mediaGenerationStorageKey } from '@/lib/storage/object-store'
import {
  buildGenerationIdempotencyKey,
  buildLockPackHash,
} from '@/lib/db/media-generation'
import {
  buildQualityLockedPrompt,
  resolveCreateModel,
  resolveEditModel,
  publicGenerationModelsForUi,
} from '@/lib/generation/model-catalog'

describe('media generative edit contracts', () => {
  it('scopes generate derivative keys to workspace/media/job', () => {
    expect(mediaGenerationStorageKey('ws-1', 'media-1', 'job-1', 'draft')).toBe(
      'ws-1/media/media-1/derivatives/generate/job-1/draft.mp4',
    )
    expect(mediaGenerationStorageKey('ws-1', 'media-1', 'job-1', 'final')).toBe(
      'ws-1/media/media-1/derivatives/generate/job-1/final.mp4',
    )
    expect(() => mediaGenerationStorageKey('ws/../x', 'm', 'j', 'slice')).toThrow(/opaque/)
  })

  it('builds stable idempotency and lock hashes', () => {
    const a = buildGenerationIdempotencyKey({
      mediaAssetId: 'm1',
      intent: 'edit',
      startMs: 0,
      endMs: 5000,
      prompt: 'change car to ford escort',
      modelId: 'seedance_2_5_edit',
      skipDraft: false,
      keepSourceAudio: true,
      referenceImageUrls: [],
      seed: null,
    })
    const b = buildGenerationIdempotencyKey({
      mediaAssetId: 'm1',
      intent: 'edit',
      startMs: 0,
      endMs: 5000,
      prompt: 'change car to ford escort',
      modelId: 'seedance_2_5_edit',
      skipDraft: false,
      keepSourceAudio: true,
      referenceImageUrls: [],
      seed: null,
    })
    const c = buildGenerationIdempotencyKey({
      mediaAssetId: 'm1',
      intent: 'edit',
      startMs: 0,
      endMs: 6000,
      prompt: 'change car to ford escort',
      modelId: 'seedance_2_5_edit',
      skipDraft: false,
      keepSourceAudio: true,
      referenceImageUrls: [],
      seed: null,
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith('generate:')).toBe(true)
    expect(buildLockPackHash({ a: 1 })).toHaveLength(32)
  })

  it('allowlists edit models and rejects create-only ids for edit resolve', () => {
    expect(resolveEditModel('seedance_2_5_edit')?.id).toBe('seedance_2_5_edit')
    expect(resolveEditModel('veo_3_1_create')).toBeNull()
    expect(resolveEditModel('unknown_model')).toBeNull()
    const ui = publicGenerationModelsForUi('edit')
    expect(ui.some((m) => m.id === 'seedance_2_5_edit')).toBe(true)
    expect(ui.every((m) => m.role !== 'create')).toBe(true)
    // Aleph stays catalog-defined but phase1Enabled only with env endpoint
    expect(resolveEditModel('runway_aleph_2')).toBeNull()
  })

  it('documents Aleph env key in paths', () => {
    const pathsSrc = readFileSync(join(process.cwd(), 'lib/paths.ts'), 'utf8')
    expect(pathsSrc).toMatch(/envGenerationAlephModel/)
    expect(pathsSrc).toMatch(/VIDEON_GENERATION_ALEPH_MODEL/)
  })

  it('scopes create storage keys without parent media', () => {
    expect(mediaGenerationCreateStorageKey('ws-1', 'job-1', 'final')).toBe(
      'ws-1/generate/job-1/final.mp4',
    )
  })

  it('allowlists create models', () => {
    expect(resolveCreateModel('seedance_2_5_t2v')?.id).toBe('seedance_2_5_t2v')
    expect(resolveCreateModel('wan_3_0_create')?.id).toBe('wan_3_0_create')
    expect(resolveCreateModel('minimax_hailuo_3_create')?.id).toBe('minimax_hailuo_3_create')
    expect(resolveCreateModel('seedance_2_5_edit')).toBeNull()
    expect(publicGenerationModelsForUi('create').some((m) => m.id === 'veo_3_1_create')).toBe(true)
    expect(publicGenerationModelsForUi('create').some((m) => m.id === 'veo_3_1_lite_create')).toBe(true)
    expect(publicGenerationModelsForUi('create').some((m) => m.id === 'wan_3_0_create')).toBe(true)
    expect(publicGenerationModelsForUi('edit').some((m) => m.id === 'minimax_hailuo_3_edit')).toBe(true)
  })

  it('wraps prompts with preserve clauses', () => {
    const locked = buildQualityLockedPrompt('Change the car to a Ford Escort')
    expect(locked).toMatch(/edit:/i)
    expect(locked).toMatch(/Preserve/i)
    expect(locked).toMatch(/Ford Escort/)
  })

  it('wires durable generate job name and worker registration', () => {
    const constants = readFileSync(join(process.cwd(), 'lib/pipeline/constants.ts'), 'utf8')
    const queue = readFileSync(join(process.cwd(), 'lib/jobs/pg-boss-queue.ts'), 'utf8')
    const worker = readFileSync(join(process.cwd(), 'lib/pipeline/worker.ts'), 'utf8')
    expect(constants).toMatch(/GENERATE_JOB_NAME = 'videon\.media\.generate'/)
    expect(queue).toMatch(/enqueueMediaGenerateJob/)
    expect(worker).toMatch(/registerMediaGenerateHandler/)
  })

  it('documents API routes in paths helpers', () => {
    const pathsSrc = readFileSync(join(process.cwd(), 'lib/paths.ts'), 'utf8')
    expect(pathsSrc).toMatch(/apiMediaGenerate:/)
    expect(pathsSrc).toMatch(/apiMediaGenerateApprove:/)
    expect(pathsSrc).toMatch(/envGenerationSeedanceModel/)
    expect(pathsSrc).toMatch(/OPENROUTER_API_KEY/)
  })
})

describe('OpenRouter video gateway mock', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-or-key'
    process.env.OPENROUTER_API_BASE_URL = 'https://openrouter.test/api/v1'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_BASE_URL
    vi.resetModules()
  })

  it('submits, polls, and returns content url', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls += 1
      if (url.endsWith('/videos') && !url.includes('/videos/')) {
        return new Response(
          JSON.stringify({
            id: 'job-1',
            polling_url: 'https://openrouter.test/api/v1/videos/job-1',
            status: 'pending',
          }),
          { status: 202 },
        )
      }
      if (url.includes('/videos/job-1') && !url.includes('/content')) {
        return new Response(
          JSON.stringify({
            id: 'job-1',
            status: 'completed',
            unsigned_urls: ['https://openrouter.test/api/v1/videos/job-1/content?index=0'],
          }),
          { status: 200 },
        )
      }
      return new Response('unexpected', { status: 500 })
    }) as typeof fetch

    const { runOpenRouterVideoEdit } = await import('@/lib/generation/openrouter-video-client')
    const result = await runOpenRouterVideoEdit({
      model: 'bytedance/seedance-2.5',
      prompt: 'edit: replace car',
      videoUrl: 'https://signed.test/slice.mp4',
      resolution: '480p',
      durationSeconds: 5,
    })
    expect(result.requestId).toBe('job-1')
    expect(result.videoUrl).toMatch(/content/)
    expect(result.requiresAuthDownload).toBe(true)
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('fails closed when unconfigured', async () => {
    delete process.env.OPENROUTER_API_KEY
    const { runOpenRouterVideoEdit, GenerationGatewayError } = await import(
      '@/lib/generation/openrouter-video-client'
    )
    await expect(
      runOpenRouterVideoEdit({
        model: 'bytedance/seedance-2.5',
        prompt: 'x',
        videoUrl: 'https://x',
        resolution: '480p',
        durationSeconds: 5,
      }),
    ).rejects.toBeInstanceOf(GenerationGatewayError)
  })
})

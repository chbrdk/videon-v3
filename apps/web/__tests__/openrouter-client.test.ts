import { afterEach, describe, expect, it } from 'vitest'
import { analyzeSceneWithOpenRouter } from '@/lib/openrouter-client'
import { schemaFallbackVisionLane } from '@/lib/vision-policy'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('OpenRouter scene gateway', () => {
  it('sends text before frames and validates the returned Qwen3.7 JSON', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_API_BASE_URL = 'https://router.invalid/api/v1'
    process.env.VIDEON_VISION_DEFAULT_MODEL = 'qwen/qwen3.7-flash'
    process.env.VIDEON_OPENROUTER_DATA_COLLECTION = 'deny'
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: Array<{ type: string }> }>; provider: Record<string, unknown> }
      expect(body.messages[0].content.map((item) => item.type)).toEqual(['text', 'image_url'])
      expect(body.provider).toMatchObject({ data_collection: 'deny' })
      return new Response(
        JSON.stringify({
          model: 'qwen/qwen3.7-flash',
          provider: 'Alibaba Cloud Int.',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  schemaVersion: 'videon.scene-insight.v1',
                  summary: 'A person speaks.',
                  subjects: [{ label: 'person', attributes: [], evidenceFrameIds: ['frame-1'] }],
                  actions: [{ label: 'speaking', startMs: 0, endMs: 2000, evidenceFrameIds: ['frame-1'] }],
                  setting: { location: 'unknown', timeOfDay: 'unknown', details: [] },
                  mood: [],
                  notableDetails: [],
                  safetyFlags: [],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 23, cost: 0.0001 },
        }),
        { status: 200, headers: { 'x-request-id': 'or-test-1' } },
      )
    }

    const result = await analyzeSceneWithOpenRouter(
      {
        locale: 'de',
        startMs: 0,
        endMs: 2000,
        frames: [{ id: 'frame-1', timestampMs: 1000, dataUrl: 'data:image/jpeg;base64,AA==' }],
        userPseudonym: 'u_hash',
      },
      { fetcher },
    )

    expect(result.insight.summary).toBe('A person speaks.')
    expect(result.provenance.usage.costUsd).toBe('0.000100')
  })

  it('sends strict JSON Schema only on the fallback lane', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.OPENROUTER_API_BASE_URL = 'https://router.invalid/api/v1'
    process.env.VIDEON_VISION_SCHEMA_FALLBACK_MODEL = 'qwen/qwen3-vl-30b-a3b-instruct'
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { response_format: Record<string, unknown>; provider: Record<string, unknown> }
      expect(body.response_format).toMatchObject({ type: 'json_schema' })
      expect(body.provider).toMatchObject({ require_parameters: true })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 })
    }
    await expect(
      analyzeSceneWithOpenRouter(
        {
          locale: 'de',
          startMs: 0,
          endMs: 1,
          frames: [{ id: 'frame-1', timestampMs: 0, dataUrl: 'data:image/jpeg;base64,AA==' }],
          userPseudonym: 'u_hash',
        },
        { lane: schemaFallbackVisionLane(), fetcher },
      ),
    ).rejects.toMatchObject({ code: 'invalid_output', retryable: true })
  })
})

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('fake-wav')),
}))

vi.mock('@/lib/runtime-config', () => ({
  transcriptionConfig: () => ({
    enabled: true,
    provider: 'openrouter',
    openRouterModel: 'openai/gpt-4o-mini-transcribe',
    whisperModel: 'small',
    language: 'de',
  }),
  openRouterApiBaseUrl: () => 'https://openrouter.ai/api/v1',
  openRouterApiKey: () => 'test-key',
}))

describe('transcribeAudioWithOpenRouter', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            text: 'Hallo Welt',
            segments: [
              { start: 0, end: 1.5, text: 'Hallo' },
              { start: 1.5, end: 2.8, text: 'Welt' },
            ],
          }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps verbose_json segments to millisecond windows', async () => {
    const { transcribeAudioWithOpenRouter } = await import('@/lib/pipeline/openrouter-transcribe')
    const result = await transcribeAudioWithOpenRouter('/tmp/sample.wav')
    expect(result.text).toBe('Hallo Welt')
    expect(result.segments).toEqual([
      { startMs: 0, endMs: 1500, text: 'Hallo' },
      { startMs: 1500, endMs: 2800, text: 'Welt' },
    ])
  })
})

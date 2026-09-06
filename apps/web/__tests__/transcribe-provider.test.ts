import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const mockConfig = vi.fn()
const mockOpenRouterConfigured = vi.fn()

vi.mock('@/lib/runtime-config', () => ({
  transcriptionConfig: () => mockConfig(),
  isOpenRouterTranscriptionConfigured: () => mockOpenRouterConfigured(),
  openRouterApiBaseUrl: () => 'https://openrouter.ai/api/v1',
  openRouterApiKey: () => 'test-key',
}))

vi.mock('@/lib/repo-root', () => ({
  resolveRepoScript: vi.fn(async () => '/tmp/transcribe-audio.py'),
}))

vi.mock('node:child_process', () => ({
  execFile: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      error: Error | null,
      stdout?: string,
      stderr?: string,
    ) => void
    if (typeof callback !== 'function') return
    callback(
      null,
      JSON.stringify({ text: 'local text', segments: [{ startMs: 0, endMs: 1000, text: 'local' }] }),
      '',
    )
  }),
}))

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => undefined),
  readFile: vi.fn(async () => Buffer.from('fake-wav')),
}))

import { transcribeAudioFile } from '@/lib/pipeline/transcribe'

describe('transcribeAudioFile provider order', () => {
  beforeEach(() => {
    mockConfig.mockReturnValue({
      enabled: true,
      provider: 'auto',
      openRouterModel: 'openai/gpt-4o-mini-transcribe',
      whisperModel: 'small',
      language: 'de',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            text: 'cloud text',
            segments: [{ start: 0, end: 1.2, text: 'cloud' }],
          }),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses OpenRouter before local Whisper in auto mode when configured', async () => {
    mockOpenRouterConfigured.mockReturnValue(true)
    const result = await transcribeAudioFile('/tmp/audio.wav')
    expect(result?.text).toBe('cloud text')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to local Whisper when OpenRouter is unavailable', async () => {
    mockOpenRouterConfigured.mockReturnValue(false)
    const result = await transcribeAudioFile('/tmp/audio.wav')
    expect(result?.text).toBe('local text')
    expect(fetch).not.toHaveBeenCalled()
  })
})

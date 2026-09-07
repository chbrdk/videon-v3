import { afterEach, describe, expect, it } from 'vitest'
import { checkSceneImageAgainstBrandion, fetchBrandionActivePack } from '@/lib/brandion-client'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('Brandion client', () => {
  it('resolves the Collection active guideline pack', async () => {
    process.env.BRANDION_API_URL = 'https://brandion.invalid'
    process.env.PLEXON_SERVICE_SECRET = 'test-secret'
    const fetcher: typeof fetch = async (url, init) => {
      expect(String(url)).toContain('/api/guidelines/active-pack')
      expect(String(url)).toContain('platformProjectId=proj-1')
      expect((init?.headers as Record<string, string>)['X-Service-Secret']).toBe('test-secret')
      return new Response(JSON.stringify({ guidelineId: 'gl-demo', tokens: [] }), { status: 200 })
    }
    const pack = await fetchBrandionActivePack('proj-1', { fetcher })
    expect(pack).toEqual({ guidelineId: 'gl-demo', platformProjectId: 'proj-1' })
  })

  it('maps Brandion image analysis-runs failed counts to fail', async () => {
    process.env.BRANDION_API_URL = 'https://brandion.invalid'
    process.env.PLEXON_SERVICE_SECRET = 'test-secret'
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { input: { kind: string; ocr: boolean } }
      expect(body.input.kind).toBe('image')
      expect(body.input.ocr).toBe(true)
      return new Response(
        JSON.stringify({
          id: 'run-1',
          status: 'completed',
          passed: 2,
          failed: 1,
          skipped: 0,
          results: [],
          observations: [],
        }),
        { status: 201 },
      )
    }

    const result = await checkSceneImageAgainstBrandion({
      guidelineId: 'gl-demo',
      platformProjectId: 'proj-1',
      sceneKey: 'scene-0',
      base64Jpeg: 'AAAA',
      brandCandidates: [{ text: 'Porsche', kind: 'logo_or_wordmark', confidence: 'likely' }],
      fetcher,
    })

    expect(result.status).toBe('fail')
    expect(result.brandionRequestId).toBe('run-1')
  })

  it('keeps queued_pending_brandion on retryable upstream errors', async () => {
    process.env.BRANDION_API_URL = 'https://brandion.invalid'
    process.env.PLEXON_SERVICE_SECRET = 'test-secret'
    const fetcher: typeof fetch = async () => new Response('down', { status: 503 })
    const result = await checkSceneImageAgainstBrandion({
      guidelineId: 'gl-demo',
      platformProjectId: 'proj-1',
      sceneKey: 'scene-0',
      base64Jpeg: 'AAAA',
      brandCandidates: [],
      fetcher,
    })
    expect(result.status).toBe('queued_pending_brandion')
  })
})

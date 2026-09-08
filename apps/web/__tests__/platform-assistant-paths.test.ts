import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_EMBED_PRODUCT,
  buildPlatformAssistantEmbedUrl,
  buildPlatformAssistantExpandUrl,
} from '../lib/platform-assistant-paths'

describe('videon platform assistant paths', () => {
  it('uses videon product id', () => {
    expect(ASSISTANT_EMBED_PRODUCT).toBe('videon')
  })

  it('returns null embed when plexon public base unset', () => {
    const prev = process.env.NEXT_PUBLIC_PLEXON_URL
    const prevBase = process.env.NEXT_PLEXON_BASE_URL
    const prevAuth = process.env.PLEXON_AUTH_URL
    delete process.env.NEXT_PUBLIC_PLEXON_URL
    delete process.env.NEXT_PLEXON_BASE_URL
    delete process.env.PLEXON_AUTH_URL
    expect(buildPlatformAssistantEmbedUrl({})).toBeNull()
    process.env.NEXT_PUBLIC_PLEXON_URL = prev
    process.env.NEXT_PLEXON_BASE_URL = prevBase
    process.env.PLEXON_AUTH_URL = prevAuth
  })

  it('builds embed and expand urls from public env', () => {
    const prev = process.env.NEXT_PUBLIC_PLEXON_URL
    process.env.NEXT_PUBLIC_PLEXON_URL = 'https://plexon-v3.example'
    const embed = buildPlatformAssistantEmbedUrl({
      platformProjectId: 'p1',
      pathname: '/library',
      theme: 'msqdx-dark',
    })
    expect(embed).toBe(
      'https://plexon-v3.example/assistant/embed?product=videon&project=p1&pathname=%2Flibrary&theme=msqdx-dark',
    )
    expect(buildPlatformAssistantExpandUrl('c1', 'p1')).toBe(
      'https://plexon-v3.example/assistant?c=c1&project=p1',
    )
    process.env.NEXT_PUBLIC_PLEXON_URL = prev
  })
})

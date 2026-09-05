import { afterEach, describe, expect, it } from 'vitest'
import { browserUploadCorsRule, uploadAllowedOrigins } from '@/lib/storage/bucket-cors'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('uploadAllowedOrigins', () => {
  it('includes the public VIDEON URL and local dev', () => {
    process.env.NEXT_PUBLIC_VIDEON_URL = 'https://videon.projects-a.plygrnd.tech/'
    expect(uploadAllowedOrigins()).toEqual([
      'https://videon.projects-a.plygrnd.tech',
      'http://localhost:3010',
    ])
  })
})

describe('browserUploadCorsRule', () => {
  it('allows browser PUT from configured origins', () => {
    const rule = browserUploadCorsRule(['https://videon.projects-a.plygrnd.tech'])
    expect(rule.AllowedMethods).toContain('PUT')
    expect(rule.AllowedOrigins).toEqual(['https://videon.projects-a.plygrnd.tech'])
    expect(rule.AllowedHeaders).toEqual(['*'])
  })
})

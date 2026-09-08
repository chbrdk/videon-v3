import { afterEach, describe, expect, it } from 'vitest'
import {
  browserUploadCorsRule,
  isMissingCorsConfigurationError,
  uploadAllowedOrigins,
} from '@/lib/storage/bucket-cors'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('uploadAllowedOrigins', () => {
  it('includes the public VIDEON URL and local dev', () => {
    process.env.NEXT_PUBLIC_VIDEON_URL = 'https://videon.projects-a.plygrnd.tech/'
    delete process.env.VIDEON_OBJECT_STORAGE_CORS_ORIGINS
    expect(uploadAllowedOrigins()).toEqual([
      'https://videon.projects-a.plygrnd.tech',
      'http://localhost:3010',
    ])
  })

  it('merges extra CORS origins from env', () => {
    process.env.NEXT_PUBLIC_VIDEON_URL = 'https://videon.projects-a.plygrnd.tech'
    process.env.VIDEON_OBJECT_STORAGE_CORS_ORIGINS = 'https://alt.example, https://videon.projects-a.plygrnd.tech/'
    expect(uploadAllowedOrigins()).toEqual([
      'https://videon.projects-a.plygrnd.tech',
      'http://localhost:3010',
      'https://alt.example',
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

describe('isMissingCorsConfigurationError', () => {
  it('treats MinIO/Garage missing-CORS phrasing as empty config', () => {
    expect(isMissingCorsConfigurationError(new Error('The CORS configuration does not exist'))).toBe(true)
    expect(isMissingCorsConfigurationError(new Error('NoSuchCORSConfiguration'))).toBe(true)
    expect(
      isMissingCorsConfigurationError(Object.assign(new Error('x'), { name: 'NoSuchCORSConfiguration' })),
    ).toBe(true)
    expect(isMissingCorsConfigurationError(new Error('AccessDenied'))).toBe(false)
  })
})

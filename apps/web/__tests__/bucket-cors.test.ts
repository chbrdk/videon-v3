import { afterEach, describe, expect, it } from 'vitest'
import {
  browserUploadCorsRule,
  isCorsApiUnsupportedError,
  isMissingCorsConfigurationError,
  uploadAllowedOrigins,
} from '@/lib/storage/bucket-cors'
import { MULTIPART_PART_SIZE_BYTES } from '@/lib/storage/s3-object-store'

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
    expect(isMissingCorsConfigurationError(new Error('AccessDenied'))).toBe(false)
  })
})

describe('isCorsApiUnsupportedError', () => {
  it('detects MinIO community PutBucketCors rejection', () => {
    expect(
      isCorsApiUnsupportedError(
        new Error('A header you provided implies functionality that is not implemented'),
      ),
    ).toBe(true)
    expect(isCorsApiUnsupportedError(new Error('AccessDenied'))).toBe(false)
  })
})

describe('multipart part size', () => {
  it('stays above the S3 5 MiB minimum for non-final parts', () => {
    expect(MULTIPART_PART_SIZE_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024)
  })
})

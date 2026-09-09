import { GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { paths } from '@/lib/paths'

const BROWSER_UPLOAD_METHODS = ['PUT', 'GET', 'HEAD'] as const

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '')
}

function corsRulesEqual(left: CORSRule[], right: CORSRule[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Providers phrase missing CORS differently (AWS / MinIO / Garage). */
export function isMissingCorsConfigurationError(error: unknown): boolean {
  const name =
    error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : ''
  const code =
    error && typeof error === 'object' && 'Code' in error ? String((error as { Code: unknown }).Code) : ''
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    name === 'NoSuchCORSConfiguration' ||
    code === 'NoSuchCORSConfiguration' ||
    message.includes('nosuchcorsconfiguration') ||
    message.includes('cors configuration does not exist') ||
    message.includes('no such cors') ||
    message.includes('not found')
  )
}

/** MinIO community returns this for PutBucketCors (AIStor-only). */
export function isCorsApiUnsupportedError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('not implemented') ||
    message.includes('not supported') ||
    message.includes('unsupported')
  )
}

export function uploadAllowedOrigins(): string[] {
  const origins = new Set<string>()
  const publicUrl = process.env.NEXT_PUBLIC_VIDEON_URL?.trim()
  if (publicUrl) origins.add(normalizeOrigin(publicUrl))
  origins.add('http://localhost:3010')
  const extra = process.env[paths.envObjectStorageCorsOrigins]?.trim()
  if (extra) {
    for (const part of extra.split(',')) {
      const origin = normalizeOrigin(part)
      if (origin) origins.add(origin)
    }
  }
  return [...origins]
}

export function browserUploadCorsRule(allowedOrigins: string[]): CORSRule {
  const origins = [...new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean))]
  return {
    AllowedHeaders: ['*'],
    AllowedMethods: [...BROWSER_UPLOAD_METHODS],
    AllowedOrigins: origins,
    ExposeHeaders: ['ETag', 'etag'],
    MaxAgeSeconds: 3600,
  }
}

export type BrowserCorsEnsureResult = 'ready' | 'unsupported' | 'failed'

/**
 * Idempotently allow browser PUT from VIDEON origins.
 * Returns `unsupported` when the provider has no bucket CORS API (e.g. MinIO community).
 */
export async function ensureBrowserUploadCors(
  client: S3Client,
  bucket: string,
): Promise<BrowserCorsEnsureResult> {
  const requiredOrigins = uploadAllowedOrigins()
  if (requiredOrigins.length === 0) return 'ready'

  const desiredRules = [browserUploadCorsRule(requiredOrigins)]
  let existingRules: CORSRule[] = []
  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
    existingRules = current.CORSRules ?? []
  } catch (error) {
    if (isCorsApiUnsupportedError(error)) return 'unsupported'
    if (!isMissingCorsConfigurationError(error)) {
      console.warn('[VIDEON-v3] GetBucketCors failed:', error instanceof Error ? error.message : error)
      return 'failed'
    }
  }

  if (corsRulesEqual(existingRules, desiredRules)) return 'ready'

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: desiredRules },
      }),
    )
    return 'ready'
  } catch (error) {
    if (isCorsApiUnsupportedError(error)) return 'unsupported'
    console.warn('[VIDEON-v3] PutBucketCors failed:', error instanceof Error ? error.message : error)
    return 'failed'
  }
}

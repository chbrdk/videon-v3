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
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  }
}

/** Idempotently allow browser PUT to the private bucket from VIDEON origins. */
export async function ensureBrowserUploadCors(client: S3Client, bucket: string): Promise<void> {
  const requiredOrigins = uploadAllowedOrigins()
  if (requiredOrigins.length === 0) return

  const desiredRules = [browserUploadCorsRule(requiredOrigins)]
  let existingRules: CORSRule[] = []
  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
    existingRules = current.CORSRules ?? []
  } catch (error) {
    if (!isMissingCorsConfigurationError(error)) throw error
  }

  if (corsRulesEqual(existingRules, desiredRules)) return

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: desiredRules },
    }),
  )
}

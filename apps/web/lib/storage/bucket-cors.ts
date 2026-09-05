import { GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'

const BROWSER_UPLOAD_METHODS = ['PUT', 'GET', 'HEAD'] as const

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '')
}

function corsRulesEqual(left: CORSRule[], right: CORSRule[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function uploadAllowedOrigins(): string[] {
  const origins = new Set<string>()
  const publicUrl = process.env.NEXT_PUBLIC_VIDEON_URL?.trim()
  if (publicUrl) origins.add(normalizeOrigin(publicUrl))
  origins.add('http://localhost:3010')
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
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('NoSuchCORSConfiguration') && !message.includes('not found')) {
      throw error
    }
  }

  if (corsRulesEqual(existingRules, desiredRules)) return

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: { CORSRules: desiredRules },
    }),
  )
}

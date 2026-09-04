import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { objectStorageConfig } from '@/lib/runtime-config'
import type {
  CreateDownloadTargetInput,
  CreateUploadTargetInput,
  ObjectStore,
  UploadTarget,
} from './object-store'

const SIGNED_URL_TTL_SECONDS = 15 * 60

function safeSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
  return trimmed
}

function sourceStorageKey(input: CreateUploadTargetInput): string {
  return `${safeSegment(input.workspaceId, 'workspaceId')}/media/${safeSegment(input.mediaAssetId, 'mediaAssetId')}/source`
}

function assertWorkspaceKey(workspaceId: string, key: string): void {
  const prefix = `${safeSegment(workspaceId, 'workspaceId')}/`
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw new Error('Storage key is outside the requested workspace')
  }
}

function contentDisposition(filename: string, disposition: 'inline' | 'attachment'): string {
  const clean = filename.replace(/[\r\n"\\]/g, '_').slice(0, 180) || 'video'
  return `${disposition}; filename="${clean}"`
}

/** Private S3-compatible boundary. Signed URLs are always short-lived and workspace-scoped. */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client
  private readonly bucket: string

  constructor() {
    const config = objectStorageConfig()
    if (!config) throw new Error('VIDEON object storage is not configured')
    this.bucket = config.bucket
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    if (!input.mimeType.startsWith('video/') || !Number.isSafeInteger(input.bytes) || input.bytes <= 0) {
      throw new Error('Only a bounded video upload may receive a storage target')
    }
    if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256)) throw new Error('checksumSha256 must be a SHA-256 digest')
    const key = sourceStorageKey(input)
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: input.mimeType,
        ContentLength: input.bytes,
        ChecksumSHA256: input.checksumSha256,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    )
    return {
      storageKey: key,
      uploadUrl: url,
      headers: {
        'content-type': input.mimeType,
        'x-amz-checksum-sha256': input.checksumSha256,
      },
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    }
  }

  async createDownloadTarget(input: CreateDownloadTargetInput): Promise<UploadTarget> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        ResponseContentDisposition: contentDisposition(input.mediaAssetId, input.disposition ?? 'inline'),
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    )
    return {
      storageKey: input.storageKey,
      uploadUrl: url,
      headers: {},
      expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    }
  }

  async removeObject(input: { workspaceId: string; storageKey: string }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: input.storageKey }))
  }
}

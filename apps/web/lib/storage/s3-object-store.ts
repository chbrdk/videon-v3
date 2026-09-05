import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { sha256HexFromStream } from './object-checksum'
import { ensureBrowserUploadCors } from './bucket-cors'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { objectStorageConfig } from '@/lib/runtime-config'
import type {
  CreateDownloadTargetInput,
  CreateUploadTargetInput,
  ObjectStore,
  UploadTarget,
} from './object-store'
import { mediaSourceStorageKey } from './object-store'

const SIGNED_URL_TTL_SECONDS = 15 * 60

function safeSegment(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed || /[\\/]/.test(trimmed)) throw new Error(`${label} must be an opaque id`)
  return trimmed
}

function sourceStorageKey(input: CreateUploadTargetInput): string {
  return mediaSourceStorageKey(input.workspaceId, input.mediaAssetId)
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
    const key = sourceStorageKey(input)
    try {
      await ensureBrowserUploadCors(this.client, this.bucket)
    } catch {
      // Credentials may lack PutBucketCors; direct browser upload still works when CORS is configured manually.
    }
    // MinIO / browser PUT: keep checksum in VIDEON DB only — provider checksum headers
    // break many S3-compatible signed uploads.
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: input.mimeType,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    )
    return {
      storageKey: key,
      uploadUrl: url,
      headers: {
        'content-type': input.mimeType,
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
        ResponseContentDisposition: contentDisposition(input.filename ?? input.mediaAssetId, input.disposition ?? 'inline'),
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

  async putObjectFromBody(input: {
    workspaceId: string
    storageKey: string
    mimeType: string
    bytes: number
    body: ReadableStream<Uint8Array> | null
  }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    if (!input.mimeType.startsWith('video/')) throw new Error('Only video uploads may be stored')
    if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) throw new Error('Upload size is invalid')
    if (!input.body) throw new Error('Upload body is missing')
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        Body: input.body,
        ContentType: input.mimeType,
        ContentLength: input.bytes,
      }),
    )
  }

  async downloadObjectToFile(input: {
    workspaceId: string
    storageKey: string
    destinationPath: string
  }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: input.storageKey }),
    )
    if (!object.Body) throw new Error('Stored object body is missing')
    await pipeline(object.Body as Readable, createWriteStream(input.destinationPath))
  }

  async removeObject(input: { workspaceId: string; storageKey: string }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: input.storageKey }))
  }

  async hashStoredObject(input: {
    workspaceId: string
    storageKey: string
    expectedBytes: number
  }): Promise<string> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: input.storageKey }),
    )
    const storedBytes = head.ContentLength
    if (storedBytes !== input.expectedBytes) {
      throw new Error(`Stored object size ${storedBytes ?? 'unknown'} does not match declared ${input.expectedBytes}`)
    }

    const object = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: input.storageKey }),
    )
    if (!object.Body) throw new Error('Stored object body is missing')
    return sha256HexFromStream(object.Body as AsyncIterable<Uint8Array>)
  }

  async uploadFileFromPath(input: {
    workspaceId: string
    storageKey: string
    filePath: string
    mimeType: string
  }): Promise<number> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const { createReadStream } = await import('node:fs')
    const { stat } = await import('node:fs/promises')
    const info = await stat(input.filePath)
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        Body: createReadStream(input.filePath),
        ContentType: input.mimeType,
        ContentLength: info.size,
      }),
    )
    return info.size
  }
}

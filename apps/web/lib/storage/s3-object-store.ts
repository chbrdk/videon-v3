import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { sha256HexFromStream } from './object-checksum'
import { ensureBrowserUploadCors } from './bucket-cors'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { objectStorageConfig, storageUrlLooksBrowserReachable } from '@/lib/runtime-config'
import type {
  CreateDownloadTargetInput,
  CreateUploadTargetInput,
  ObjectStore,
  UploadTarget,
} from './object-store'
import { mediaSourceStorageKey } from './object-store'

const SIGNED_URL_TTL_SECONDS = 15 * 60

/** 8 MiB chunks — above S3's 5 MiB minimum for non-final parts; Traefik-friendly. */
export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024

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

function buildS3Client(input: {
  region: string
  endpoint?: string
  forcePathStyle: boolean
  accessKeyId: string
  secretAccessKey: string
}): S3Client {
  return new S3Client({
    region: input.region,
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    forcePathStyle: input.forcePathStyle,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  })
}

/** Private S3-compatible boundary. Signed URLs are always short-lived and workspace-scoped. */
export class S3ObjectStore implements ObjectStore {
  private readonly client: S3Client
  /** Client whose endpoint matches the host the browser will call (SigV4). */
  private readonly signClient: S3Client
  private readonly bucket: string
  private readonly browserSigningReachable: boolean

  constructor() {
    const config = objectStorageConfig()
    if (!config) throw new Error('VIDEON object storage is not configured')
    this.bucket = config.bucket
    this.client = buildS3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    })
    const signEndpoint = config.publicEndpoint || config.endpoint
    this.signClient =
      signEndpoint && signEndpoint !== config.endpoint
        ? buildS3Client({
            region: config.region,
            endpoint: signEndpoint,
            forcePathStyle: config.forcePathStyle,
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          })
        : this.client
    this.browserSigningReachable = signEndpoint
      ? storageUrlLooksBrowserReachable(signEndpoint)
      : true
  }

  /** False when signed URLs would target a host the browser cannot reach. */
  canSignBrowserUpload(): boolean {
    return this.browserSigningReachable
  }

  /** True when bucket CORS can be ensured for browser direct PUT. */
  async canUseBrowserDirectUpload(): Promise<boolean> {
    if (!this.browserSigningReachable) return false
    const result = await ensureBrowserUploadCors(this.signClient, this.bucket)
    return result === 'ready'
  }

  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    if (!input.mimeType.startsWith('video/') || !Number.isSafeInteger(input.bytes) || input.bytes <= 0) {
      throw new Error('Only a bounded video upload may receive a storage target')
    }
    const key = sourceStorageKey(input)
    const url = await getSignedUrl(
      this.signClient,
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

  async createMultipartUpload(input: {
    workspaceId: string
    storageKey: string
    mimeType: string
  }): Promise<{ uploadId: string }> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        ContentType: input.mimeType,
      }),
    )
    if (!result.UploadId) throw new Error('CreateMultipartUpload returned no UploadId')
    return { uploadId: result.UploadId }
  }

  async uploadMultipartPart(input: {
    workspaceId: string
    storageKey: string
    uploadId: string
    partNumber: number
    bytes: number
    body: ReadableStream<Uint8Array> | null
  }): Promise<{ etag: string }> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    if (!input.body) throw new Error('Upload part body is missing')
    if (!Number.isInteger(input.partNumber) || input.partNumber < 1 || input.partNumber > 10000) {
      throw new Error('partNumber must be between 1 and 10000')
    }
    if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0) {
      throw new Error('Upload part size is invalid')
    }
    const result = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        Body: input.body,
        ContentLength: input.bytes,
      }),
    )
    if (!result.ETag) throw new Error('UploadPart returned no ETag')
    return { etag: result.ETag.replaceAll('"', '') }
  }

  async completeMultipartUpload(input: {
    workspaceId: string
    storageKey: string
    uploadId: string
    parts: Array<{ partNumber: number; etag: string }>
  }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    if (input.parts.length === 0) throw new Error('Multipart upload has no parts')
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: input.parts
            .slice()
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              ETag: part.etag.includes('"') ? part.etag : `"${part.etag}"`,
              PartNumber: part.partNumber,
            })),
        },
      }),
    )
  }

  async abortMultipartUpload(input: {
    workspaceId: string
    storageKey: string
    uploadId: string
  }): Promise<void> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        UploadId: input.uploadId,
      }),
    )
  }

  async createDownloadTarget(input: CreateDownloadTargetInput): Promise<UploadTarget> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const url = await getSignedUrl(
      this.signClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        ResponseContentDisposition: contentDisposition(
          input.filename ?? input.mediaAssetId,
          input.disposition ?? 'inline',
        ),
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

  async openObjectStream(input: {
    workspaceId: string
    storageKey: string
    range?: string | null
  }): Promise<{
    body: Readable
    contentType: string | undefined
    contentLength: number | undefined
    contentRange: string | undefined
    acceptRanges: string | undefined
    statusCode: 200 | 206
  }> {
    assertWorkspaceKey(input.workspaceId, input.storageKey)
    const object = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.storageKey,
        ...(input.range ? { Range: input.range } : {}),
      }),
    )
    if (!object.Body) throw new Error('Stored object body is missing')
    return {
      body: object.Body as Readable,
      contentType: object.ContentType,
      contentLength: object.ContentLength,
      contentRange: object.ContentRange,
      acceptRanges: object.AcceptRanges,
      statusCode: object.ContentRange ? 206 : 200,
    }
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
      throw new Error(
        `Stored object size ${storedBytes ?? 'unknown'} does not match declared ${input.expectedBytes}`,
      )
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

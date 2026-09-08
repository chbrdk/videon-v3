import { afterEach, describe, expect, it } from 'vitest'
import { objectStorageConfig, storageUrlLooksBrowserReachable } from '@/lib/runtime-config'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe('private object storage configuration', () => {
  it('does not choose an implicit storage provider', () => {
    delete process.env.VIDEON_OBJECT_STORAGE_REGION
    delete process.env.VIDEON_OBJECT_STORAGE_BUCKET
    delete process.env.VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID
    delete process.env.VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY
    expect(objectStorageConfig()).toBeNull()
  })

  it('fails closed when only part of the S3-compatible configuration exists', () => {
    process.env.VIDEON_OBJECT_STORAGE_REGION = 'auto'
    delete process.env.VIDEON_OBJECT_STORAGE_BUCKET
    expect(() => objectStorageConfig()).toThrow('incomplete')
  })

  it('creates a workspace-scoped signed upload target', async () => {
    process.env.VIDEON_OBJECT_STORAGE_REGION = 'auto'
    process.env.VIDEON_OBJECT_STORAGE_BUCKET = 'videon-private'
    process.env.VIDEON_OBJECT_STORAGE_ENDPOINT = 'https://objects.example.test'
    process.env.VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID = 'test-key'
    process.env.VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY = 'test-secret'
    process.env.VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE = 'true'

    const target = await new S3ObjectStore().createUploadTarget({
      workspaceId: 'workspace-1',
      mediaAssetId: 'media-1',
      mimeType: 'video/mp4',
      bytes: 1024,
    })

    expect(target.storageKey).toBe('workspace-1/media/media-1/source')
    expect(target.uploadUrl).toContain('objects.example.test')
    expect(target.headers).toMatchObject({ 'content-type': 'video/mp4' })
  })

  it('rejects signed download targets outside the workspace prefix (E2)', async () => {
    process.env.VIDEON_OBJECT_STORAGE_REGION = 'auto'
    process.env.VIDEON_OBJECT_STORAGE_BUCKET = 'videon-private'
    process.env.VIDEON_OBJECT_STORAGE_ENDPOINT = 'https://objects.example.test'
    process.env.VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID = 'test-key'
    process.env.VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY = 'test-secret'
    process.env.VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE = 'true'

    await expect(
      new S3ObjectStore().createDownloadTarget({
        workspaceId: 'workspace-1',
        mediaAssetId: 'media-1',
        storageKey: 'workspace-other/media/media-1/source',
      }),
    ).rejects.toThrow(/outside the requested workspace/)
  })

  it('signs against the public endpoint when configured', async () => {
    process.env.VIDEON_OBJECT_STORAGE_REGION = 'auto'
    process.env.VIDEON_OBJECT_STORAGE_BUCKET = 'videon-private'
    process.env.VIDEON_OBJECT_STORAGE_ENDPOINT = 'http://minio:9000'
    process.env.VIDEON_OBJECT_STORAGE_PUBLIC_ENDPOINT = 'https://objects.example.test'
    process.env.VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID = 'test-key'
    process.env.VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY = 'test-secret'
    process.env.VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE = 'true'

    const store = new S3ObjectStore()
    expect(store.canSignBrowserUpload()).toBe(true)
    const target = await store.createUploadTarget({
      workspaceId: 'workspace-1',
      mediaAssetId: 'media-1',
      mimeType: 'video/mp4',
      bytes: 1024,
    })
    expect(target.uploadUrl).toContain('objects.example.test')
    expect(target.uploadUrl).not.toContain('minio:9000')
  })

  it('marks docker-internal endpoint as not browser-signable without public endpoint', () => {
    process.env.VIDEON_OBJECT_STORAGE_REGION = 'auto'
    process.env.VIDEON_OBJECT_STORAGE_BUCKET = 'videon-private'
    process.env.VIDEON_OBJECT_STORAGE_ENDPOINT = 'http://minio:9000'
    delete process.env.VIDEON_OBJECT_STORAGE_PUBLIC_ENDPOINT
    process.env.VIDEON_OBJECT_STORAGE_ACCESS_KEY_ID = 'test-key'
    process.env.VIDEON_OBJECT_STORAGE_SECRET_ACCESS_KEY = 'test-secret'
    process.env.VIDEON_OBJECT_STORAGE_FORCE_PATH_STYLE = 'true'

    expect(new S3ObjectStore().canSignBrowserUpload()).toBe(false)
  })
})

describe('storageUrlLooksBrowserReachable', () => {
  it('rejects private and docker hosts', () => {
    expect(storageUrlLooksBrowserReachable('http://minio:9000')).toBe(false)
    expect(storageUrlLooksBrowserReachable('http://10.0.0.5:9000')).toBe(false)
    expect(storageUrlLooksBrowserReachable('http://localhost:9000')).toBe(true)
    expect(storageUrlLooksBrowserReachable('https://objects.example.test')).toBe(true)
  })
})

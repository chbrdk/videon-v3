import { afterEach, describe, expect, it } from 'vitest'
import { objectStorageConfig } from '@/lib/runtime-config'
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
      checksumSha256: 'a'.repeat(64),
    })

    expect(target.storageKey).toBe('workspace-1/media/media-1/source')
    expect(target.uploadUrl).toContain('objects.example.test')
    expect(target.headers).toMatchObject({ 'content-type': 'video/mp4' })
  })
})

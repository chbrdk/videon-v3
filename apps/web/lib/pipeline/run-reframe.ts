import { readFile, unlink, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  findMediaReframe,
  markMediaReframeFailed,
  markMediaReframeProgress,
  markMediaReframeRunning,
  markMediaReframeSucceeded,
} from '@/lib/db/media-reframes'
import { findMediaAsset } from '@/lib/db/media'
import { reframeServiceUrl } from '@/lib/runtime-config'
import { mediaReframeStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'

async function callReframeService(input: {
  sourcePath: string
  aspectRatio: string
  smoothingFactor: number
  customWidth: number | null
  customHeight: number | null
  destinationPath: string
}): Promise<void> {
  const base = reframeServiceUrl()
  if (!base) throw new Error('VIDEON_REFRAME_SERVICE_URL is not configured')

  const sourceBytes = await readFile(input.sourcePath)
  const { Agent, FormData: UndiciFormData, fetch: undiciFetch } = await import('undici')
  const form = new UndiciFormData()
  form.append('aspectRatio', input.aspectRatio)
  form.append('smoothingFactor', String(input.smoothingFactor))
  form.append('saliencyModel', 'robust_v1')
  if (input.customWidth != null) form.append('customWidth', String(input.customWidth))
  if (input.customHeight != null) form.append('customHeight', String(input.customHeight))
  form.append(
    'file',
    new File([new Uint8Array(sourceBytes)], 'source.mp4', { type: 'video/mp4' }),
  )

  const timeoutMs = 60 * 60 * 1000
  const agent = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: 60_000,
  })

  try {
    const response = (await undiciFetch(`${base}/v1/reframe`, {
      method: 'POST',
      body: form,
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
    })) as unknown as Response
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Reframe worker HTTP ${response.status}: ${text.slice(0, 400)}`)
    }
    const buf = Buffer.from(await response.arrayBuffer())
    if (!buf.length) throw new Error('Reframe worker returned empty body')
    await writeFile(input.destinationPath, buf)
  } finally {
    await agent.close().catch(() => {})
  }
}

export async function runMediaReframe(reframeId: string): Promise<void> {
  const job = await findMediaReframe(reframeId)
  if (!job) throw new Error(`Reframe ${reframeId} not found`)
  if (job.status === 'succeeded') return

  await markMediaReframeRunning(reframeId)
  await markMediaReframeProgress(reframeId, 5)

  const media = await findMediaAsset(job.mediaAssetId)
  if (!media || media.workspaceId !== job.workspaceId) {
    await markMediaReframeFailed(reframeId, 'Media asset not found')
    return
  }

  const store = new S3ObjectStore()
  const sourcePath = join(tmpdir(), `videon-reframe-src-${randomUUID()}.mp4`)
  const outPath = join(tmpdir(), `videon-reframe-out-${randomUUID()}.mp4`)

  try {
    await store.downloadObjectToFile({
      workspaceId: job.workspaceId,
      storageKey: media.storageKey,
      destinationPath: sourcePath,
    })
    await markMediaReframeProgress(reframeId, 20)

    await callReframeService({
      sourcePath,
      aspectRatio: job.aspectRatio,
      smoothingFactor: job.smoothingFactor,
      customWidth: job.customWidth,
      customHeight: job.customHeight,
      destinationPath: outPath,
    })
    await markMediaReframeProgress(reframeId, 85)

    const storageKey = mediaReframeStorageKey(job.workspaceId, job.mediaAssetId, job.id)
    const bytes = (await stat(outPath)).size
    await store.uploadFileFromPath({
      workspaceId: job.workspaceId,
      storageKey,
      mimeType: 'video/mp4',
      filePath: outPath,
    })
    await markMediaReframeSucceeded({ reframeId, storageKey, bytes })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await markMediaReframeFailed(reframeId, message)
    throw error
  } finally {
    await unlink(sourcePath).catch(() => {})
    await unlink(outPath).catch(() => {})
  }
}

import { readFile, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { upsertMediaAudioStem } from '@/lib/db/media-stems'
import { STEM_DEMUCS_CAPABILITY } from '@/lib/pipeline/constants'
import { resolveRepoScript } from '@/lib/repo-root'
import { mediaStemStorageKey } from '@/lib/storage/object-store'
import { S3ObjectStore } from '@/lib/storage/s3-object-store'
import { stemServiceUrl } from '@/lib/runtime-config'

const execFileAsync = promisify(execFile)

export type StemMethod = 'ffmpeg_mid_side' | 'demucs'

type StemScriptResult = {
  method: string
  voicePath?: string
  musicPath?: string
  durationMs: number
  voicePeaks: number[]
  musicPeaks: number[]
}

export function resolveStemMethod(requestedCapabilities: string[] | null | undefined): StemMethod {
  if (requestedCapabilities?.includes(STEM_DEMUCS_CAPABILITY)) return 'demucs'
  return 'ffmpeg_mid_side'
}

function parseMultipartBoundary(contentType: string | null): string | null {
  if (!contentType) return null
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  return (match?.[1] || match?.[2] || '').trim() || null
}

function parseStemMultipart(
  body: Buffer,
  boundary: string,
): { meta: StemScriptResult; voice: Buffer; music: Buffer } {
  const delim = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let start = body.indexOf(delim)
  while (start !== -1) {
    const next = body.indexOf(delim, start + delim.length)
    if (next === -1) break
    const slice = body.subarray(start + delim.length, next)
    // strip leading CRLF and trailing CRLF
    let part = slice
    if (part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2)
    if (part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) {
      part = part.subarray(0, part.length - 2)
    }
    if (part.length > 0 && !part.equals(Buffer.from('--'))) parts.push(part)
    start = next
  }

  let meta: StemScriptResult | null = null
  let voice: Buffer | null = null
  let music: Buffer | null = null
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const header = part.subarray(0, headerEnd).toString('utf8')
    const content = part.subarray(headerEnd + 4)
    if (/name="meta"/i.test(header)) {
      meta = JSON.parse(content.toString('utf8')) as StemScriptResult
    } else if (/name="voice"/i.test(header)) {
      voice = content
    } else if (/name="music"/i.test(header)) {
      music = content
    }
  }
  if (!meta || !voice || !music) {
    throw new Error('Stem service returned an incomplete multipart payload')
  }
  return { meta, voice, music }
}

async function separateViaStemService(input: {
  sourcePath: string
  method: StemMethod
  voicePath: string
  musicPath: string
}): Promise<StemScriptResult> {
  const base = stemServiceUrl()
  if (!base) throw new Error('VIDEON_STEM_SERVICE_URL is not configured')

  const sourceBytes = await readFile(input.sourcePath)
  // Undici's default headersTimeout (~300s) aborts long Demucs jobs before the
  // first response byte. AbortSignal alone does not override that.
  // Use undici FormData with node:buffer File — mixing global FormData into
  // undici.fetch drops the file part (FastAPI 422: body.file missing).
  const timeoutMs = input.method === 'demucs' ? 40 * 60 * 1000 : 10 * 60 * 1000
  const { Agent, FormData: UndiciFormData, fetch: undiciFetch } = await import('undici')
  const { File } = await import('node:buffer')
  const form = new UndiciFormData()
  form.append('method', input.method)
  form.append(
    'file',
    new File([new Uint8Array(sourceBytes)], 'source.bin', { type: 'application/octet-stream' }),
  )
  const agent = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
    connectTimeout: 60_000,
  })

  let response: Response
  try {
    response = (await undiciFetch(`${base}/v1/separate`, {
      method: 'POST',
      body: form,
      dispatcher: agent,
      signal: AbortSignal.timeout(timeoutMs),
    })) as unknown as Response
  } finally {
    await agent.close().catch(() => {})
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Stem service HTTP ${response.status}: ${text.slice(0, 240)}`)
  }
  const boundary = parseMultipartBoundary(response.headers.get('content-type'))
  if (!boundary) throw new Error('Stem service response missing multipart boundary')
  const buffer = Buffer.from(await response.arrayBuffer())
  const parsed = parseStemMultipart(buffer, boundary)
  await writeFile(input.voicePath, parsed.voice)
  await writeFile(input.musicPath, parsed.music)
  return {
    method: parsed.meta.method,
    durationMs: parsed.meta.durationMs,
    voicePeaks: parsed.meta.voicePeaks ?? [],
    musicPeaks: parsed.meta.musicPeaks ?? [],
    voicePath: input.voicePath,
    musicPath: input.musicPath,
  }
}

async function separateViaLocalScript(input: {
  sourcePath: string
  method: StemMethod
  voicePath: string
  musicPath: string
}): Promise<StemScriptResult> {
  const scriptPath = await resolveRepoScript('scripts/separate-audio-stems.py')
  const { stdout } = await execFileAsync(
    'python3',
    [
      scriptPath,
      input.sourcePath,
      input.voicePath,
      input.musicPath,
      '--buckets',
      '240',
      '--method',
      input.method,
    ],
    {
      maxBuffer: 8 * 1024 * 1024,
      timeout: input.method === 'demucs' ? 35 * 60 * 1000 : 10 * 60 * 1000,
    },
  )
  return JSON.parse(stdout) as StemScriptResult
}

export async function separateAndStoreAudioStems(input: {
  sourcePath: string
  workspaceId: string
  mediaAssetId: string
  analysisRunId: string
  store: S3ObjectStore
  method?: StemMethod
}): Promise<'stemmed' | 'stem_failed'> {
  const voicePath = join(tmpdir(), `videon-stem-voice-${randomUUID()}.wav`)
  const musicPath = join(tmpdir(), `videon-stem-music-${randomUUID()}.wav`)
  const method = input.method ?? 'ffmpeg_mid_side'
  try {
    const preferService = Boolean(stemServiceUrl())
    const parsed = preferService
      ? await separateViaStemService({
          sourcePath: input.sourcePath,
          method,
          voicePath,
          musicPath,
        }).catch(async (error) => {
          // Local script has no Demucs in the web image — fallback always becomes
          // ffmpeg_*_fallback. Prefer failing the stem stage over a fake "Voice" track
          // when the dedicated stem worker is configured but rejects the request.
          const message = error instanceof Error ? error.message : String(error)
          if (/Stem service HTTP 4\d\d/.test(message)) {
            console.error('[VIDEON-v3] Stem service client error (no local demucs fallback)', error)
            throw error
          }
          console.warn('[VIDEON-v3] Stem service failed, falling back to local script', error)
          return separateViaLocalScript({
            sourcePath: input.sourcePath,
            method,
            voicePath,
            musicPath,
          })
        })
      : await separateViaLocalScript({
          sourcePath: input.sourcePath,
          method,
          voicePath,
          musicPath,
        })

    const recordedMethod = typeof parsed.method === 'string' ? parsed.method : method
    const durationMs = Number.isFinite(parsed.durationMs) ? Math.max(0, Math.floor(parsed.durationMs)) : null

    for (const stem of [
      {
        kind: 'voice' as const,
        path: parsed.voicePath || voicePath,
        peaks: Array.isArray(parsed.voicePeaks) ? parsed.voicePeaks : [],
      },
      {
        kind: 'music' as const,
        path: parsed.musicPath || musicPath,
        peaks: Array.isArray(parsed.musicPeaks) ? parsed.musicPeaks : [],
      },
    ]) {
      const storageKey = mediaStemStorageKey(input.workspaceId, input.mediaAssetId, stem.kind)
      const bytes = await input.store.uploadFileFromPath({
        workspaceId: input.workspaceId,
        storageKey,
        filePath: stem.path,
        mimeType: 'audio/wav',
      })
      await upsertMediaAudioStem({
        mediaAssetId: input.mediaAssetId,
        analysisRunId: input.analysisRunId,
        stemKind: stem.kind,
        storageKey,
        bytes,
        durationMs,
        peaks: stem.peaks,
        method: recordedMethod,
      })
    }
    return 'stemmed'
  } catch {
    return 'stem_failed'
  } finally {
    await unlink(voicePath).catch(() => {})
    await unlink(musicPath).catch(() => {})
  }
}

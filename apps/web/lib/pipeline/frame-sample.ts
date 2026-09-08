import { execFile } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import type { VisionFrame } from '@/lib/openrouter-client'

const execFileAsync = promisify(execFile)

function timestampForMs(ms: number): string {
  const totalSeconds = Math.max(ms, 0) / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
}

async function extractFrame(sourcePath: string, timestampMs: number, frameId: string): Promise<VisionFrame> {
  const outputPath = join(tmpdir(), `videon-frame-${randomUUID()}.jpg`)
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestampForMs(timestampMs),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      '-y',
      outputPath,
    ])
    const bytes = await readFile(outputPath)
    return {
      id: frameId,
      timestampMs,
      dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`,
    }
  } finally {
    await unlink(outputPath).catch(() => {})
  }
}

/** JPEG bytes for Product API posters (assistant / thumbnails). Scaled for chat. */
export async function extractFrameJpegBytes(
  sourcePath: string,
  timestampMs: number,
  options?: { maxWidth?: number },
): Promise<Buffer | null> {
  const outputPath = join(tmpdir(), `videon-frame-bytes-${randomUUID()}.jpg`)
  const maxWidth = options?.maxWidth && options.maxWidth > 0 ? Math.floor(options.maxWidth) : 480
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestampForMs(timestampMs),
      '-i',
      sourcePath,
      '-frames:v',
      '1',
      '-vf',
      `scale=${maxWidth}:-2`,
      '-q:v',
      '5',
      '-y',
      outputPath,
    ])
    return await readFile(outputPath)
  } catch {
    return null
  } finally {
    await unlink(outputPath).catch(() => {})
  }
}

const PREVIEW_DURATION_MIN_MS = 1
const PREVIEW_DURATION_MAX_MS = 3000

/**
 * Short muted MP4 clip for assistant hover preview.
 * Spec: specs/api/media-preview.md — durationMs clamped to 1..3000.
 */
export async function extractPreviewMp4Bytes(
  sourcePath: string,
  timestampMs: number,
  durationMs = PREVIEW_DURATION_MAX_MS,
): Promise<Buffer | null> {
  const clampedMs = Math.min(
    PREVIEW_DURATION_MAX_MS,
    Math.max(PREVIEW_DURATION_MIN_MS, Math.floor(Number.isFinite(durationMs) ? durationMs : PREVIEW_DURATION_MAX_MS)),
  )
  const durationSec = clampedMs / 1000
  const outputPath = join(tmpdir(), `videon-preview-${randomUUID()}.mp4`)
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestampForMs(timestampMs),
      '-i',
      sourcePath,
      '-t',
      String(durationSec),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-movflags',
      '+faststart',
      '-y',
      outputPath,
    ])
    return await readFile(outputPath)
  } catch {
    return null
  } finally {
    await unlink(outputPath).catch(() => {})
  }
}

/** JPEG base64 (no data-URL prefix) for Brandion analysis-runs image input. */
export async function extractFrameJpegBase64(
  sourcePath: string,
  timestampMs: number,
): Promise<{ base64: string; mimeType: 'image/jpeg'; } | null> {
  try {
    const frame = await extractFrame(sourcePath, timestampMs, `brand-${timestampMs}`)
    const marker = 'base64,'
    const idx = frame.dataUrl.indexOf(marker)
    if (idx < 0) return null
    return { base64: frame.dataUrl.slice(idx + marker.length), mimeType: 'image/jpeg' }
  } catch {
    return null
  }
}

export async function sampleSceneFrames(input: {
  sourcePath: string
  sceneKey: string
  startMs: number
  endMs: number
}): Promise<VisionFrame[]> {
  const span = Math.max(input.endMs - input.startMs, 1)
  const samplePoints = [
    input.startMs,
    input.startMs + Math.floor(span / 2),
    Math.max(input.endMs - 250, input.startMs),
  ]
  const uniquePoints = [...new Set(samplePoints)]
  const frames: VisionFrame[] = []
  for (let index = 0; index < uniquePoints.length; index += 1) {
    frames.push(
      await extractFrame(input.sourcePath, uniquePoints[index], `${input.sceneKey}-f${index}`),
    )
  }
  return frames
}

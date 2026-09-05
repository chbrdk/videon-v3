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

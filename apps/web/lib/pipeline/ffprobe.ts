import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ProbeResult = {
  durationMs: number
  width: number | null
  height: number | null
  frameRate: number | null
}

function parseFrameRate(value: string | undefined): number | null {
  if (!value) return null
  if (value.includes('/')) {
    const [num, den] = value.split('/').map(Number)
    if (!num || !den) return null
    return num / den
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function probeMediaFile(sourcePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    sourcePath,
  ])
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string }
    streams?: Array<{ codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }>
  }
  const durationSec = Number(parsed.format?.duration ?? 0)
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video')
  return {
    durationMs: Number.isFinite(durationSec) && durationSec > 0 ? Math.round(durationSec * 1000) : 0,
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    frameRate: parseFrameRate(videoStream?.avg_frame_rate ?? videoStream?.r_frame_rate),
  }
}

export async function ffprobeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffprobe', ['-version'])
    return true
  } catch {
    return false
  }
}

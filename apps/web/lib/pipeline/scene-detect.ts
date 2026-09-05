import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DetectedScene = {
  key: string
  startMs: number
  endMs: number
}

const MAX_SCENE_MS = 30_000
const MIN_SCENE_MS = 1_500
const SCENE_THRESHOLD = 0.35

/** Deterministic fallback when ffmpeg scene detection is unavailable. */
export function detectScenes(durationMs: number): DetectedScene[] {
  const safeDuration = Math.max(durationMs, 1_000)
  const scenes: DetectedScene[] = []
  for (let start = 0; start < safeDuration; start += MAX_SCENE_MS) {
    scenes.push({
      key: `scene-${scenes.length}`,
      startMs: start,
      endMs: Math.min(start + MAX_SCENE_MS, safeDuration),
    })
  }
  return scenes
}

function parseSceneCutPointsMs(stderr: string): number[] {
  const points = new Set<number>([0])
  for (const line of stderr.split('\n')) {
    const match = line.match(/pts_time:([0-9.]+)/)
    if (!match) continue
    const ms = Math.round(Number(match[1]) * 1000)
    if (Number.isFinite(ms) && ms >= 0) points.add(ms)
  }
  return [...points].sort((a, b) => a - b)
}

function normalizeScenes(raw: Array<{ startMs: number; endMs: number }>, durationMs: number): DetectedScene[] {
  const safeDuration = Math.max(durationMs, 1_000)
  const bounded = raw
    .map((scene) => ({
      startMs: Math.max(0, Math.min(scene.startMs, safeDuration)),
      endMs: Math.max(Math.min(scene.endMs, safeDuration), scene.startMs + MIN_SCENE_MS),
    }))
    .filter((scene) => scene.endMs - scene.startMs >= MIN_SCENE_MS)

  const merged: Array<{ startMs: number; endMs: number }> = []
  for (const scene of bounded) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push(scene)
      continue
    }
    if (scene.endMs - scene.startMs < MIN_SCENE_MS || scene.startMs - last.endMs < 250) {
      last.endMs = Math.max(last.endMs, scene.endMs)
      continue
    }
    merged.push(scene)
  }

  const split: Array<{ startMs: number; endMs: number }> = []
  for (const scene of merged) {
    let cursor = scene.startMs
    while (cursor < scene.endMs) {
      const endMs = Math.min(cursor + MAX_SCENE_MS, scene.endMs)
      split.push({ startMs: cursor, endMs })
      cursor = endMs
    }
  }

  if (!split.length) return detectScenes(safeDuration)
  return split.map((scene, index) => ({
    key: `scene-${index}`,
    startMs: scene.startMs,
    endMs: scene.endMs,
  }))
}

export async function detectScenesFromFile(sourcePath: string, durationMs: number): Promise<DetectedScene[]> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'info',
        '-i',
        sourcePath,
        '-filter:v',
        `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
        '-f',
        'null',
        '-',
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    )
    const cutPoints = parseSceneCutPointsMs(stderr)
    const boundaries =
      cutPoints.length > 1
        ? cutPoints.map((startMs, index) => ({
            startMs,
            endMs: cutPoints[index + 1] ?? Math.max(durationMs, startMs + MIN_SCENE_MS),
          }))
        : [{ startMs: 0, endMs: Math.max(durationMs, MIN_SCENE_MS) }]
    return normalizeScenes(boundaries, durationMs)
  } catch {
    return detectScenes(durationMs)
  }
}

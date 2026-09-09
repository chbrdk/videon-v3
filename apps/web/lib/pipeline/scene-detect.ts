import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type DetectedScene = {
  key: string
  startMs: number
  endMs: number
}

/** Vision/window cap for long unbroken takes. */
export const MAX_SCENE_MS = 30_000
/** Drop only micro-flicker; keep rapid montage cuts. */
export const MIN_SCENE_MS = 400
/** ffmpeg scene score (0–1); lower = more sensitive. See specs/domain/scene-detect.md */
export const SCENE_THRESHOLD = 0.22

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

/**
 * Turn cut boundaries into abutting scenes.
 * Abutting scenes (gap 0) must stay separate — do not merge on small/zero gaps.
 */
export function normalizeScenes(
  raw: Array<{ startMs: number; endMs: number }>,
  durationMs: number,
): DetectedScene[] {
  const safeDuration = Math.max(durationMs, 1_000)
  const bounded = raw
    .map((scene) => {
      const startMs = Math.max(0, Math.min(scene.startMs, safeDuration))
      const endMs = Math.max(startMs, Math.min(scene.endMs, safeDuration))
      return { startMs, endMs }
    })
    .filter((scene) => scene.endMs > scene.startMs)

  const merged: Array<{ startMs: number; endMs: number }> = []
  for (const scene of bounded) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push({ ...scene })
      continue
    }

    // Overlap / duplicate boundary → absorb into previous.
    if (scene.startMs < last.endMs) {
      last.endMs = Math.max(last.endMs, scene.endMs)
      continue
    }

    // Micro-scene → absorb into previous (keeps timeline continuous).
    if (scene.endMs - scene.startMs < MIN_SCENE_MS) {
      last.endMs = Math.max(last.endMs, scene.endMs)
      continue
    }

    // Close a tiny positive hole so scenes always abut.
    if (scene.startMs > last.endMs) {
      last.endMs = scene.startMs
    }

    merged.push({ ...scene })
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

export function scenesFromCutPointsMs(cutPoints: number[], durationMs: number): DetectedScene[] {
  const safeDuration = Math.max(durationMs, 1_000)
  const unique = [...new Set([0, ...cutPoints.filter((ms) => ms > 0 && ms < safeDuration), safeDuration])].sort(
    (a, b) => a - b,
  )
  const boundaries =
    unique.length > 1
      ? unique.slice(0, -1).map((startMs, index) => ({
          startMs,
          endMs: unique[index + 1]!,
        }))
      : [{ startMs: 0, endMs: safeDuration }]
  return normalizeScenes(boundaries, safeDuration)
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
    return scenesFromCutPointsMs(cutPoints, durationMs)
  } catch {
    return detectScenes(durationMs)
  }
}

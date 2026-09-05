export type DetectedScene = {
  key: string
  startMs: number
  endMs: number
}

const MAX_SCENE_MS = 30_000

/** Deterministic scene windows until PySceneDetect lands in a dedicated worker image. */
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

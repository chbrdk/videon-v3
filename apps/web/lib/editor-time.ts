export function frameDurationMs(frameRate: number | null | undefined): number {
  const fps = frameRate && frameRate > 0 ? frameRate : 25
  return Math.round(1000 / fps)
}

export function normalizeInOutRange(input: {
  inMs: number | null
  outMs: number | null
  durationMs: number
  minDurationMs?: number
}): { startMs: number; endMs: number } | null {
  const minDurationMs = input.minDurationMs ?? 500
  if (input.inMs === null || input.outMs === null) return null
  const startMs = Math.max(0, Math.min(input.inMs, input.outMs))
  const endMs = Math.min(input.durationMs, Math.max(input.inMs, input.outMs))
  if (endMs - startMs < minDurationMs) return null
  return { startMs, endMs }
}

export function downsamplePeaks(channelData: Float32Array, buckets: number): number[] {
  const peaks: number[] = []
  const block = Math.max(Math.floor(channelData.length / buckets), 1)
  for (let index = 0; index < buckets; index += 1) {
    const start = index * block
    const end = Math.min(start + block, channelData.length)
    let peak = 0
    for (let sample = start; sample < end; sample += 1) {
      peak = Math.max(peak, Math.abs(channelData[sample] ?? 0))
    }
    peaks.push(peak)
  }
  return peaks
}

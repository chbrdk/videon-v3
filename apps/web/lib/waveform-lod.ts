/** Downsample peak samples to roughly one bucket per display pixel. */
export function downsamplePeaks(peaks: number[], targetBuckets: number): number[] {
  if (peaks.length === 0) return peaks
  const buckets = Math.max(1, Math.floor(targetBuckets))
  if (peaks.length <= buckets) return peaks
  const out: number[] = []
  const step = peaks.length / buckets
  for (let i = 0; i < buckets; i += 1) {
    const from = Math.floor(i * step)
    const to = Math.max(from + 1, Math.floor((i + 1) * step))
    let max = 0
    for (let j = from; j < to && j < peaks.length; j += 1) {
      max = Math.max(max, Math.abs(peaks[j] ?? 0))
    }
    out.push(max)
  }
  return out
}

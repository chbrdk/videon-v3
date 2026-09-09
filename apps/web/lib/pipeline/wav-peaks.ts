import { readFile } from 'node:fs/promises'
import { downsamplePeaks } from '@/lib/editor-time'

/** Peak buckets for mix / stem waveforms (matches stem worker default). */
export const WAVEFORM_PEAK_BUCKETS = 240

/**
 * Downsample a mono 16-bit PCM WAV (ffmpeg extract output) into abs-peak buckets.
 * Returns [] when the file is missing, empty, or not 16-bit PCM.
 */
export async function peaksFromMonoWavFile(
  filePath: string,
  buckets = WAVEFORM_PEAK_BUCKETS,
): Promise<number[]> {
  const buffer = Buffer.from(await readFile(filePath))
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return []

  let offset = 12
  let dataOffset = -1
  let dataSize = 0
  let bitsPerSample = 16
  let channels = 1

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    if (id === 'fmt ' && size >= 16) {
      channels = buffer.readUInt16LE(chunkStart + 2)
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
    } else if (id === 'data') {
      dataOffset = chunkStart
      dataSize = size
      break
    }
    offset = chunkStart + size + (size % 2)
  }

  if (dataOffset < 0 || bitsPerSample !== 16 || channels < 1) return []
  const bytesPerFrame = 2 * channels
  const sampleCount = Math.floor(dataSize / bytesPerFrame)
  if (sampleCount <= 0) return []

  const samples = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = buffer.readInt16LE(dataOffset + i * bytesPerFrame)
    samples[i] = sample / 32768
  }
  return downsamplePeaks(samples, buckets)
}

import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function extractAudioTrack(input: {
  sourcePath: string
  destinationPath: string
}): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input.sourcePath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      input.destinationPath,
    ])
    await access(input.destinationPath)
    return true
  } catch {
    return false
  }
}

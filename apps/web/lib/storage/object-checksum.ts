import { createHash } from 'node:crypto'

export async function sha256HexFromStream(
  stream: AsyncIterable<Uint8Array | Buffer | string>,
): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of stream) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

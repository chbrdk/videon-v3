import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

export async function sha256HexFromStream(
  stream: AsyncIterable<Uint8Array | Buffer | string> | Readable,
): Promise<string> {
  const hash = createHash('sha256')

  // Node Readable that may already be flowing (or SdkStreamMixin wrapping one).
  if (stream instanceof Readable || (stream && typeof stream === 'object' && 'readable' in stream)) {
    const node = stream as Readable
    if (typeof node.pause === 'function') node.pause()
    for await (const chunk of node) {
      hash.update(chunk as Buffer | Uint8Array | string)
    }
    return hash.digest('hex')
  }

  for await (const chunk of stream as AsyncIterable<Uint8Array | Buffer | string>) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

/** Prefer SDK byte helpers when present; otherwise stream-hash. */
export async function sha256HexFromS3Body(body: {
  transformToByteArray?: () => Promise<Uint8Array>
  transformToWebStream?: () => ReadableStream<Uint8Array>
} & AsyncIterable<Uint8Array>): Promise<string> {
  if (typeof body.transformToWebStream === 'function') {
    const web = body.transformToWebStream()
    const node = Readable.fromWeb(web as import('node:stream/web').ReadableStream)
    return sha256HexFromStream(node)
  }
  return sha256HexFromStream(body)
}

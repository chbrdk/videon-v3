import { describe, expect, it } from 'vitest'

function parseMultipartBoundary(contentType: string | null): string | null {
  if (!contentType) return null
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  return (match?.[1] || match?.[2] || '').trim() || null
}

function parseStemMultipart(
  body: Buffer,
  boundary: string,
): { meta: { method: string }; voice: Buffer; music: Buffer } {
  const delim = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let start = body.indexOf(delim)
  while (start !== -1) {
    const next = body.indexOf(delim, start + delim.length)
    if (next === -1) break
    let part = body.subarray(start + delim.length, next)
    if (part[0] === 0x0d && part[1] === 0x0a) part = part.subarray(2)
    if (part[part.length - 2] === 0x0d && part[part.length - 1] === 0x0a) {
      part = part.subarray(0, part.length - 2)
    }
    if (part.length > 0 && !part.equals(Buffer.from('--'))) parts.push(part)
    start = next
  }
  let meta: { method: string } | null = null
  let voice: Buffer | null = null
  let music: Buffer | null = null
  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd < 0) continue
    const header = part.subarray(0, headerEnd).toString('utf8')
    const content = part.subarray(headerEnd + 4)
    if (/name="meta"/i.test(header)) meta = JSON.parse(content.toString('utf8')) as { method: string }
    else if (/name="voice"/i.test(header)) voice = content
    else if (/name="music"/i.test(header)) music = content
  }
  if (!meta || !voice || !music) throw new Error('incomplete')
  return { meta, voice, music }
}

describe('stem service multipart', () => {
  it('parses boundary and parts', () => {
    const boundary = 'videonstemboundary'
    const meta = Buffer.from(JSON.stringify({ method: 'demucs_htdemucs' }))
    const voice = Buffer.from('VOICE')
    const music = Buffer.from('MUSIC')
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="meta"\r\nContent-Type: application/json\r\n\r\n`),
      meta,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="voice"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
      voice,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="music"; filename="music.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
      music,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    expect(parseMultipartBoundary(`multipart/form-data; boundary=${boundary}`)).toBe(boundary)
    const parsed = parseStemMultipart(body, boundary)
    expect(parsed.meta.method).toBe('demucs_htdemucs')
    expect(parsed.voice.toString()).toBe('VOICE')
    expect(parsed.music.toString()).toBe('MUSIC')
  })
})

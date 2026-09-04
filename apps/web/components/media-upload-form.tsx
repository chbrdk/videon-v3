'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function MediaUploadForm({ platformProjectId }: { platformProjectId: string }) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      setProgress('Checksum wird berechnet …')
      const checksumSha256 = await sha256Hex(file)
      setProgress('Signierte Upload-URL wird angefordert …')
      const intentResponse = await fetch(paths.routes.apiMediaUploadIntent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformProjectId,
          originalFilename: file.name,
          mimeType: file.type || 'video/mp4',
          bytes: file.size,
          checksumSha256,
        }),
      })
      const intentBody = (await intentResponse.json()) as {
        media?: { id: string }
        upload?: { uploadUrl: string; headers: Record<string, string> }
        error?: { message?: string }
      }
      if (!intentResponse.ok || !intentBody.media || !intentBody.upload) {
        throw new Error(intentBody.error?.message || 'Upload-Intent fehlgeschlagen')
      }

      setProgress('Datei wird zu Object Storage übertragen …')
      const putResponse = await fetch(intentBody.upload.uploadUrl, {
        method: 'PUT',
        headers: intentBody.upload.headers,
        body: file,
      })
      if (!putResponse.ok) {
        throw new Error(`Object-Storage-Upload fehlgeschlagen (${putResponse.status})`)
      }

      setProgress('Upload wird abgeschlossen …')
      const completeResponse = await fetch(paths.routes.apiMediaComplete(intentBody.media.id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformProjectId }),
      })
      const completeBody = (await completeResponse.json()) as { error?: { message?: string } }
      if (!completeResponse.ok) {
        throw new Error(completeBody.error?.message || 'Upload-Abschluss fehlgeschlagen')
      }

      router.push(paths.routes.libraryFor(platformProjectId))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="videon-upload-form" onSubmit={onSubmit}>
      <Field label="Video-Datei" size="md">
        <input
          type="file"
          accept="video/*"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </Field>
      {file ? (
        <Text role="meta" as="p">
          {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
        </Text>
      ) : null}
      {progress ? <Text role="body">{progress}</Text> : null}
      {error ? <Text role="body">{error}</Text> : null}
      <Button type="submit" variant="primary" disabled={!file || busy}>
        {busy ? 'Lädt …' : 'Hochladen'}
      </Button>
    </form>
  )
}

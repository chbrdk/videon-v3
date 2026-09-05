'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Field, Text } from '@msqdx/ui'
import { paths } from '@/lib/paths'

function putFileWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value)
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      reject(new Error(`Object-Storage-Upload fehlgeschlagen (${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Object-Storage-Upload fehlgeschlagen (Netzwerkfehler)'))
    xhr.onabort = () => reject(new Error('Object-Storage-Upload abgebrochen'))
    xhr.send(file)
  })
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
      setProgress('Signierte Upload-URL wird angefordert …')
      const intentResponse = await fetch(paths.routes.apiMediaUploadIntent, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformProjectId,
          originalFilename: file.name,
          mimeType: file.type || 'video/mp4',
          bytes: file.size,
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

      setProgress('Datei wird zu Object Storage übertragen … 0 %')
      await putFileWithProgress(intentBody.upload.uploadUrl, file, intentBody.upload.headers, (percent) => {
        setProgress(`Datei wird zu Object Storage übertragen … ${percent} %`)
      })

      setProgress('Upload wird geprüft und abgeschlossen …')
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

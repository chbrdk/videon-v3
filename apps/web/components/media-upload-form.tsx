'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { paths } from '@/lib/paths'

function putFileWithProgress(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const resolvedUrl = new URL(url, window.location.href)
    const sameOrigin = resolvedUrl.origin === window.location.origin
    xhr.open('PUT', resolvedUrl.toString())
    xhr.withCredentials = sameOrigin
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
      let message = `Upload fehlgeschlagen (${xhr.status})`
      try {
        const body = JSON.parse(xhr.responseText) as { error?: { message?: string } }
        if (body.error?.message) message = body.error.message
      } catch {
        // ignore non-JSON error bodies
      }
      reject(new Error(message))
    }
    xhr.onerror = () =>
      reject(
        new Error(
          sameOrigin
            ? 'Upload fehlgeschlagen (Netzwerkfehler)'
            : 'Upload fehlgeschlagen (Object Storage nicht erreichbar oder CORS blockiert)',
        ),
      )
    xhr.onabort = () => reject(new Error('Upload abgebrochen'))
    xhr.send(file)
  })
}

async function uploadMultipartChunks(input: {
  file: File
  partSizeBytes: number
  partUrlBase: string
  headers: Record<string, string>
  onProgress: (percent: number) => void
}): Promise<void> {
  const totalParts = Math.ceil(input.file.size / input.partSizeBytes)
  let uploadedBytes = 0
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    const start = (partNumber - 1) * input.partSizeBytes
    const end = Math.min(start + input.partSizeBytes, input.file.size)
    const chunk = input.file.slice(start, end)
    const url = `${input.partUrlBase}&partNumber=${partNumber}`
    await putFileWithProgress(url, chunk, input.headers, (partPercent) => {
      const partDone = Math.round((chunk.size * partPercent) / 100)
      const overall = Math.min(100, Math.round(((uploadedBytes + partDone) / input.file.size) * 100))
      input.onProgress(overall)
    })
    uploadedBytes += chunk.size
    input.onProgress(Math.min(100, Math.round((uploadedBytes / input.file.size) * 100)))
  }
}

export function MediaUploadForm({ platformProjectId }: { platformProjectId: string }) {
  const router = useRouter()
  const { setPlatformProjectId } = useActiveCollection()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!file || busy) return
    if (file.size > paths.maxUploadBytes) {
      setError(`Datei ist zu groß (max. ${(paths.maxUploadBytes / (1024 * 1024 * 1024)).toFixed(1)} GB).`)
      return
    }
    setBusy(true)
    setError(null)
    setPlatformProjectId(platformProjectId)
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
        upload?: {
          uploadUrl?: string
          headers: Record<string, string>
          mode?: 'direct' | 'proxy' | 'multipart'
          partSizeBytes?: number
          partUrl?: string
        }
        error?: { message?: string }
      }
      if (!intentResponse.ok || !intentBody.media || !intentBody.upload) {
        throw new Error(intentBody.error?.message || 'Upload-Intent fehlgeschlagen')
      }

      const mediaId = intentBody.media.id
      const mode = intentBody.upload.mode ?? 'direct'

      if (mode === 'multipart') {
        if (!intentBody.upload.partUrl || !intentBody.upload.partSizeBytes) {
          throw new Error('Multipart-Upload unvollständig konfiguriert')
        }
        setProgress('Datei wird in Teilen übertragen … 0 %')
        await uploadMultipartChunks({
          file,
          partSizeBytes: intentBody.upload.partSizeBytes,
          partUrlBase: intentBody.upload.partUrl,
          headers: intentBody.upload.headers,
          onProgress: (percent) => setProgress(`Datei wird in Teilen übertragen … ${percent} %`),
        })
      } else if (mode === 'proxy') {
        setProgress('Datei wird übertragen (Proxy) … 0 %')
        await putFileWithProgress(
          paths.routes.apiMediaUpload(mediaId, platformProjectId),
          file,
          { 'content-type': file.type || 'video/mp4' },
          (percent) => setProgress(`Datei wird übertragen (Proxy) … ${percent} %`),
        )
      } else {
        if (!intentBody.upload.uploadUrl) throw new Error('Direct-Upload-URL fehlt')
        try {
          setProgress('Datei wird übertragen … 0 %')
          await putFileWithProgress(
            intentBody.upload.uploadUrl,
            file,
            intentBody.upload.headers,
            (percent) => setProgress(`Datei wird übertragen … ${percent} %`),
          )
        } catch (directError) {
          const message = directError instanceof Error ? directError.message : ''
          const looksCors =
            message.includes('CORS') ||
            message.includes('Object Storage nicht erreichbar') ||
            message.includes('Netzwerkfehler')
          if (!looksCors) throw directError
          // CORS unexpectedly blocked — restart via multipart intent would need a new media row;
          // fall back to same-origin single proxy for small files only.
          if (file.size > 12 * 1024 * 1024) {
            throw new Error(
              'Direct-Upload blockiert (CORS). Bitte erneut versuchen — der Server sollte Multipart wählen.',
            )
          }
          setProgress('Direct-Upload blockiert — wechsle auf Same-Origin-Proxy …')
          await putFileWithProgress(
            paths.routes.apiMediaUpload(mediaId, platformProjectId),
            file,
            { 'content-type': file.type || 'video/mp4' },
            (percent) => setProgress(`Datei wird übertragen (Proxy) … ${percent} %`),
          )
        }
      }

      setProgress('Upload wird geprüft und abgeschlossen …')
      const completeResponse = await fetch(paths.routes.apiMediaComplete(mediaId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformProjectId }),
      })
      const completeBody = (await completeResponse.json()) as {
        media?: { id: string }
        error?: { message?: string }
      }
      if (!completeResponse.ok) {
        throw new Error(completeBody.error?.message || 'Upload-Abschluss fehlgeschlagen')
      }

      router.push(paths.routes.mediaFor(completeBody.media?.id ?? mediaId, platformProjectId))
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
          className="videon-upload-form__file"
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
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button type="submit" variant="primary" disabled={!file || busy}>
        {busy ? 'Lädt …' : 'Hochladen'}
      </Button>
    </form>
  )
}

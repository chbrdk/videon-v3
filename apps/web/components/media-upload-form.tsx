'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Text } from '@msqdx/ui'
import { useActiveCollection } from '@/components/collection-context'
import { paths } from '@/lib/paths'

function putFileWithProgress(
  url: string,
  file: File,
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
      if (xhr.status === 408 || xhr.status === 413) {
        message = `Upload fehlgeschlagen (${xhr.status}) — Datei zu groß für Proxy oder Timeout. Direct-Upload/CORS prüfen.`
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
        upload?: { uploadUrl: string; headers: Record<string, string>; mode?: 'direct' | 'proxy' }
        error?: { message?: string }
      }
      if (!intentResponse.ok || !intentBody.media || !intentBody.upload) {
        throw new Error(intentBody.error?.message || 'Upload-Intent fehlgeschlagen')
      }

      const mediaId = intentBody.media.id
      const proxyUrl = paths.routes.apiMediaUpload(mediaId, platformProjectId)
      const proxyHeaders = {
        'content-type': file.type || 'video/mp4',
      }

      const uploadVia = async (url: string, headers: Record<string, string>, label: string) => {
        setProgress(`${label} … 0 %`)
        await putFileWithProgress(url, file, headers, (percent) => {
          setProgress(`${label} … ${percent} %`)
        })
      }

      if (intentBody.upload.mode === 'proxy') {
        await uploadVia(proxyUrl, proxyHeaders, 'Datei wird übertragen (Proxy)')
      } else {
        try {
          await uploadVia(intentBody.upload.uploadUrl, intentBody.upload.headers, 'Datei wird übertragen')
        } catch (directError) {
          const message = directError instanceof Error ? directError.message : ''
          const looksCors =
            message.includes('CORS') ||
            message.includes('Object Storage nicht erreichbar') ||
            message.includes('Netzwerkfehler')
          if (!looksCors) throw directError
          setProgress('Direct-Upload blockiert — wechsle auf Same-Origin-Proxy …')
          await uploadVia(proxyUrl, proxyHeaders, 'Datei wird übertragen (Proxy)')
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

/**
 * UXP-safe HTTP helpers.
 * Prefer XHR onload/onerror properties — avoid EventTarget.addEventListener
 * (UXP domjs has thrown on some listener paths).
 */

/**
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string | ArrayBuffer | Blob | null, signal?: AbortSignal, responseType?: '' | 'text' | 'arraybuffer' | 'blob' | 'json' }} [init]
 * @returns {Promise<{ ok: boolean, status: number, statusText: string, json: () => Promise<any>, text: () => Promise<string>, blob: () => Promise<Blob>, arrayBuffer: () => Promise<ArrayBuffer> }>}
 */
export function httpRequest(url, init = {}) {
  const method = (init.method || 'GET').toUpperCase()
  const headers = init.headers || {}
  const responseType = init.responseType || ''
  const body = init.body == null ? null : init.body

  if (typeof XMLHttpRequest === 'function') {
    return new Promise((resolve, reject) => {
      let settled = false
      const xhr = new XMLHttpRequest()
      try {
        xhr.open(method, url, true)
        if (responseType) xhr.responseType = responseType
      } catch (error) {
        reject(error)
        return
      }
      for (const [key, value] of Object.entries(headers)) {
        if (value != null) xhr.setRequestHeader(key, String(value))
      }

      const finish = (fn, arg) => {
        if (settled) return
        settled = true
        fn(arg)
      }

      xhr.onload = () => {
        const status = xhr.status || 0
        const raw = xhr.response
        const bodyText =
          typeof raw === 'string'
            ? raw
            : raw == null || responseType === 'arraybuffer' || responseType === 'blob'
              ? ''
              : String(raw)
        finish(resolve, {
          ok: status >= 200 && status < 300,
          status,
          statusText: xhr.statusText || '',
          json: async () => {
            if (responseType === 'json' && raw && typeof raw === 'object') return raw
            const text =
              bodyText || (raw instanceof ArrayBuffer ? new TextDecoder().decode(raw) : '')
            return text ? JSON.parse(text) : null
          },
          text: async () => {
            if (typeof raw === 'string') return raw
            if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw)
            return bodyText
          },
          blob: async () => {
            if (typeof Blob === 'function' && raw instanceof Blob) return raw
            if (raw instanceof ArrayBuffer) return new Blob([raw])
            return new Blob([bodyText])
          },
          arrayBuffer: async () => {
            if (raw instanceof ArrayBuffer) return raw
            if (typeof Blob === 'function' && raw instanceof Blob) return raw.arrayBuffer()
            return new TextEncoder().encode(bodyText).buffer
          },
        })
      }
      xhr.onerror = () => finish(reject, new Error(`Network error (${method} ${url})`))
      xhr.onabort = () => finish(reject, new Error('Request aborted'))

      if (init.signal) {
        if (init.signal.aborted) {
          xhr.abort()
          return
        }
        const prev = typeof init.signal.onabort === 'function' ? init.signal.onabort : null
        init.signal.onabort = (event) => {
          try {
            if (prev) prev.call(init.signal, event)
          } catch {
            /* ignore */
          }
          try {
            xhr.abort()
          } catch {
            /* ignore */
          }
        }
      }

      try {
        xhr.send(body)
      } catch (error) {
        finish(reject, error)
      }
    })
  }

  return fetch(url, init).then(async (response) => ({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: () => response.json(),
    text: () => response.text(),
    blob: () => response.blob(),
    arrayBuffer: () => response.arrayBuffer(),
  }))
}

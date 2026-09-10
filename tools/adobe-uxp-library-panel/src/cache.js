/**
 * Local media cache for Adobe insert.
 * Spec: adobe-uxp-library-panel.md — cacheKey = mediaAssetId:kind:checksum
 *
 * - Reuse by cacheKey when file still exists in UXP data folder
 * - Drop stale index rows when file missing
 * - Soft cap via oldest-first eviction (bytes + entry count)
 * - clearCache() for Settings UI
 */

import {
  DEFAULT_MAX_CACHE_BYTES,
  DEFAULT_MAX_CACHE_ENTRIES,
  cacheStats,
  formatCacheBytes,
  parseCacheIndex,
  pickEvictionKeys,
  removeKeysFromIndex,
} from './cache-index.js'
import { httpRequest } from './http.js'
import { loadNativeModule } from './native.js'
import { isHttpUrl } from './premiere-path.js'

const META_KEY = 'videon.adobe.cacheIndex'
const POSTER_META_KEY = 'videon.adobe.posterIndex'

export { cacheStats, formatCacheBytes, DEFAULT_MAX_CACHE_BYTES, DEFAULT_MAX_CACHE_ENTRIES }

function readIndex() {
  try {
    return parseCacheIndex(JSON.parse(localStorage.getItem(META_KEY) || '{}'))
  } catch {
    return parseCacheIndex({})
  }
}

function writeIndex(index) {
  localStorage.setItem(META_KEY, JSON.stringify(index))
}

function readPosterIndex() {
  try {
    return parseCacheIndex(JSON.parse(localStorage.getItem(POSTER_META_KEY) || '{}'))
  } catch {
    return parseCacheIndex({})
  }
}

function writePosterIndex(index) {
  localStorage.setItem(POSTER_META_KEY, JSON.stringify(index))
}

function sanitizeFilename(name) {
  const base = String(name || 'clip.mp4').replace(/[^\w.\-()+ ]+/g, '_').slice(0, 120)
  return base.includes('.') ? base : `${base}.mp4`
}

function cacheFileName(cacheKey, filename) {
  return `${String(cacheKey).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80)}_${sanitizeFilename(filename)}`
}

async function getUxpFs() {
  const uxp = await loadNativeModule('uxp')
  const fs = uxp.storage?.localFileSystem
  if (!fs?.getDataFolder) {
    throw new Error('UXP localFileSystem nicht verfügbar — Cache unmöglich')
  }
  return { uxp, fs }
}

async function getDataFolder() {
  const { fs } = await getUxpFs()
  return fs.getDataFolder()
}

async function findEntryByName(folder, fileName) {
  if (!fileName || typeof folder.getEntries !== 'function') return null
  try {
    const entries = await folder.getEntries()
    return entries.find((entry) => entry?.name === fileName && !entry.isFolder) || null
  } catch {
    return null
  }
}

async function deleteEntrySafe(entry) {
  if (!entry) return
  try {
    if (typeof entry.delete === 'function') await entry.delete()
  } catch {
    /* best-effort */
  }
}

/**
 * Resolve a live local path for cacheKey, or null if missing/stale.
 * Removes stale rows from the index.
 */
export async function resolveCachedPath(cacheKey) {
  const index = readIndex()
  const entry = index[cacheKey]
  if (!entry) return null
  if (entry.path && isHttpUrl(entry.path)) {
    writeIndex(removeKeysFromIndex(index, [cacheKey]))
    return null
  }

  try {
    const folder = await getDataFolder()
    const fileName = entry.fileName || (entry.path ? entry.path.split(/[/\\]/).pop() : null)
    if (!fileName) {
      writeIndex(removeKeysFromIndex(index, [cacheKey]))
      return null
    }
    const file = await findEntryByName(folder, fileName)
    if (!file?.nativePath || isHttpUrl(file.nativePath)) {
      writeIndex(removeKeysFromIndex(index, [cacheKey]))
      return null
    }
    // Touch for LRU-ish eviction
    index[cacheKey] = {
      ...entry,
      fileName,
      path: file.nativePath,
      at: Date.now(),
      bytes: entry.bytes || 0,
    }
    writeIndex(index)
    return file.nativePath
  } catch {
    return null
  }
}

/** Sync peek without FS — may be stale; prefer resolveCachedPath before import. */
export function getCachedPath(cacheKey) {
  const entry = readIndex()[cacheKey]
  const path = entry?.path || null
  if (!path || isHttpUrl(path)) return null
  return path
}

export function getCacheStats() {
  return cacheStats(readIndex())
}

async function evictIfNeeded(index, keepKey, incomingBytes) {
  const keys = pickEvictionKeys(index, {
    keepKey,
    incomingBytes,
    maxBytes: DEFAULT_MAX_CACHE_BYTES,
    maxEntries: DEFAULT_MAX_CACHE_ENTRIES,
  })
  if (!keys.length) return index

  try {
    const folder = await getDataFolder()
    for (const key of keys) {
      const entry = index[key]
      const name = entry?.fileName
      if (name) {
        const file = await findEntryByName(folder, name)
        await deleteEntrySafe(file)
      }
    }
  } catch {
    /* index still shrinks */
  }
  return removeKeysFromIndex(index, keys)
}

/**
 * @returns {Promise<string>} absolute/native local path for Premiere importFiles
 */
export async function materializeDownload(input) {
  const { cacheKey, downloadUrl, filename } = input
  if (!downloadUrl) throw new Error('downloadUrl fehlt')
  if (!cacheKey) throw new Error('cacheKey fehlt')

  const existing = await resolveCachedPath(cacheKey)
  if (existing) return existing

  const { uxp } = await getUxpFs()
  const folder = await getDataFolder()
  const fileName = cacheFileName(cacheKey, filename)
  const file = await folder.createFile(fileName, { overwrite: true })

  const response = await httpRequest(downloadUrl, { responseType: 'arraybuffer' })
  if (!response.ok) {
    throw new Error(`Download fehlgeschlagen: ${response.status} ${response.statusText}`)
  }
  const buffer = await response.arrayBuffer()
  if (!buffer.byteLength) throw new Error('Download leer')

  await file.write(buffer, { format: uxp.storage.formats.binary })

  const nativePath = file.nativePath
  if (!nativePath || isHttpUrl(nativePath)) {
    throw new Error('Kein nativer Dateipfad nach Cache-Write — Premiere-Import blockiert')
  }

  let index = await evictIfNeeded(readIndex(), cacheKey, buffer.byteLength)
  index[cacheKey] = {
    path: nativePath,
    fileName,
    at: Date.now(),
    bytes: buffer.byteLength,
  }
  writeIndex(index)
  return nativePath
}

export function posterCacheKey(hit, width = 240) {
  const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1000
  return `${hit.mediaAssetId}:poster:w${width}:t${t}`
}

export function previewCacheKey(hit, durationMs = 2000) {
  const t = hit.startMs != null && hit.startMs >= 0 ? Math.floor(hit.startMs) : 1000
  return `${hit.mediaAssetId}:preview:t${t}:d${durationMs}`
}

/** Build a file:// URL from a native OS path (macOS/Windows). */
function nativePathToFileUrl(nativePath) {
  if (!nativePath || typeof nativePath !== 'string') return null
  const trimmed = nativePath.trim()
  if (!trimmed) return null
  if (/^file:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) {
    return `file://${encodeURI(trimmed).replace(/#/g, '%23')}`
  }
  // Windows: C:\foo\bar.mp4 → file:///C:/foo/bar.mp4
  return `file:///${encodeURI(trimmed.replace(/\\/g, '/')).replace(/#/g, '%23')}`
}

/**
 * Resolve UXP-playable URL candidates for a File entry.
 * Premiere <video> often rejects blob: — try plugin-data / getFsUrl / file:// nativePath.
 * @returns {Promise<string[]>}
 */
async function resolveEntryPlaybackUrls(file) {
  if (!file) return []
  const out = []
  const push = (value) => {
    const s = value != null ? String(value).trim() : ''
    if (s && !out.includes(s)) out.push(s)
  }

  try {
    if (file.url) push(file.url)
  } catch {
    /* ignore */
  }

  try {
    const { fs } = await getUxpFs()
    if (typeof fs.getFsUrl === 'function') push(fs.getFsUrl(file))
  } catch {
    /* fall through */
  }

  try {
    if (file.name) push(`plugin-data:/${file.name}`)
  } catch {
    /* ignore */
  }

  try {
    const native = file.nativePath
    if (native) {
      push(nativePathToFileUrl(native))
      push(native)
    }
  } catch {
    /* ignore */
  }

  return out
}

/** @returns {Promise<string | null>} first candidate, or null */
async function resolveEntryPlaybackUrl(file) {
  const urls = await resolveEntryPlaybackUrls(file)
  return urls[0] || null
}

/** Read cached preview MP4 as Blob, or null. */
export async function readCachedPreviewBlob(cacheKey) {
  const index = readPosterIndex()
  const entry = index[cacheKey]
  if (!entry?.fileName) return null
  try {
    const { uxp } = await getUxpFs()
    const folder = await getDataFolder()
    const file = await findEntryByName(folder, entry.fileName)
    if (!file || typeof file.read !== 'function') return null
    const data = await file.read({ format: uxp.storage.formats.binary })
    if (!data || (data.byteLength != null && data.byteLength === 0)) return null
    index[cacheKey] = { ...entry, at: Date.now() }
    writePosterIndex(index)
    return new Blob([data], { type: 'video/mp4' })
  } catch {
    return null
  }
}

/**
 * Persist preview MP4 and return UXP-playable src URL candidates (+ optional blob fallback).
 * @returns {Promise<{ url: string, urls: string[], via: 'file' | 'blob' } | null>}
 */
export async function materializePreview(input) {
  const { cacheKey, blob, filename } = input
  if (!cacheKey || !blob) return null

  const index = readPosterIndex()
  const existing = index[cacheKey]
  if (existing?.fileName) {
    try {
      const folder = await getDataFolder()
      const file = await findEntryByName(folder, existing.fileName)
      const urls = await resolveEntryPlaybackUrls(file)
      if (urls.length) {
        index[cacheKey] = { ...existing, at: Date.now() }
        writePosterIndex(index)
        return { url: urls[0], urls, via: 'file' }
      }
    } catch {
      /* rewrite */
    }
  }

  try {
    const { uxp } = await getUxpFs()
    const folder = await getDataFolder()
    const fileName = cacheFileName(cacheKey, filename || 'preview.mp4')
    const file = await folder.createFile(fileName, { overwrite: true })
    const buffer = blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer()
    if (!buffer?.byteLength) return null
    await file.write(buffer, { format: uxp.storage.formats.binary })
    index[cacheKey] = {
      path: file.nativePath || undefined,
      fileName,
      at: Date.now(),
      bytes: buffer.byteLength,
    }
    writePosterIndex(index)
    const urls = await resolveEntryPlaybackUrls(file)
    if (urls.length) {
      console.info('[VIDEON] materializePreview ok', fileName, urls[0], `(${urls.length} candidates)`)
      return { url: urls[0], urls, via: 'file' }
    }
    console.warn('[VIDEON] materializePreview wrote file but no playback URL', fileName, file?.nativePath)
  } catch (error) {
    console.warn('[VIDEON] materializePreview file write failed', error)
  }

  try {
    const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob], { type: 'video/mp4' }))
    return { url, urls: [url], via: 'blob' }
  } catch {
    return null
  }
}

/** Read cached poster bytes as Blob, or null. */
export async function readCachedPosterBlob(cacheKey) {
  const index = readPosterIndex()
  const entry = index[cacheKey]
  if (!entry?.fileName) return null
  try {
    const { uxp } = await getUxpFs()
    const folder = await getDataFolder()
    const file = await findEntryByName(folder, entry.fileName)
    if (!file || typeof file.read !== 'function') return null
    const data = await file.read({ format: uxp.storage.formats.binary })
    if (!data || (data.byteLength != null && data.byteLength === 0)) return null
    index[cacheKey] = { ...entry, at: Date.now() }
    writePosterIndex(index)
    return new Blob([data], { type: 'image/jpeg' })
  } catch {
    return null
  }
}

/**
 * Persist poster JPEG bytes for later readCachedPosterBlob.
 */
export async function materializePoster(input) {
  const { cacheKey, blob, filename } = input
  if (!cacheKey || !blob) return null

  const index = readPosterIndex()
  const existing = index[cacheKey]
  if (existing?.fileName) {
    try {
      const folder = await getDataFolder()
      const file = await findEntryByName(folder, existing.fileName)
      if (file?.nativePath && !isHttpUrl(file.nativePath)) {
        index[cacheKey] = { ...existing, at: Date.now() }
        writePosterIndex(index)
        return file.nativePath
      }
    } catch {
      /* rewrite */
    }
  }

  try {
    const { uxp } = await getUxpFs()
    const folder = await getDataFolder()
    const fileName = cacheFileName(cacheKey, filename || 'poster.jpg')
    const file = await folder.createFile(fileName, { overwrite: true })
    const buffer = await blob.arrayBuffer()
    await file.write(buffer, { format: uxp.storage.formats.binary })
    if (!file.nativePath || isHttpUrl(file.nativePath)) return null
    index[cacheKey] = {
      path: file.nativePath,
      fileName,
      at: Date.now(),
      bytes: buffer.byteLength,
    }
    writePosterIndex(index)
    return file.nativePath
  } catch {
    return null
  }
}

/** Delete all cached media (+ posters) and clear indexes. */
export async function clearCache() {
  const media = readIndex()
  const posters = readPosterIndex()
  let deleted = 0

  try {
    const folder = await getDataFolder()
    for (const entry of [...Object.values(media), ...Object.values(posters)]) {
      if (!entry?.fileName) continue
      const file = await findEntryByName(folder, entry.fileName)
      if (file) {
        await deleteEntrySafe(file)
        deleted += 1
      }
    }
  } catch {
    /* still clear indexes */
  }

  writeIndex({})
  writePosterIndex({})
  return { deleted, ...cacheStats({}) }
}

export async function refreshCacheStats() {
  // Drop obviously stale sync paths without full FS walk of unknown files
  const index = readIndex()
  const folder = await getDataFolder().catch(() => null)
  if (!folder) return cacheStats(index)

  let next = { ...index }
  for (const [key, entry] of Object.entries(index)) {
    const name = entry.fileName
    if (!name) {
      next = removeKeysFromIndex(next, [key])
      continue
    }
    const file = await findEntryByName(folder, name)
    if (!file) next = removeKeysFromIndex(next, [key])
  }
  writeIndex(next)
  return cacheStats(next)
}

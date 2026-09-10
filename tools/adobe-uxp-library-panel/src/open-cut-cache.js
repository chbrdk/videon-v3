/**
 * Open Cut extract cache — UXP data folder + fflate.
 * Spec: adobe-uxp-open-cut-premiere.md § B.7
 */

// Browser build only — Node entry requires `module`/`worker_threads` (breaks UXP).
// Build aliases `fflate` → `fflate/esm/browser.js` (see build.cjs).
import { unzipSync } from 'fflate'
import { loadNativeModule } from './native.js'
import {
  OPEN_CUT_MAX_BYTES,
  OPEN_CUT_MAX_TREES,
  pickXmlPathFromEntries,
  sanitizeOpenCutFolder,
} from './open-cut-model.js'

const INDEX_KEY = 'videon.adobe.openCutIndex'
const ROOT_FOLDER = 'open-cut'

function readIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

function writeIndex(index) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

async function getUxpFs() {
  const uxp = await loadNativeModule('uxp')
  const fs = uxp.storage?.localFileSystem
  if (!fs?.getDataFolder) throw new Error('UXP localFileSystem nicht verfügbar')
  return { uxp, fs }
}

async function getDataFolder() {
  const { fs } = await getUxpFs()
  return fs.getDataFolder()
}

async function ensureChildFolder(parent, name) {
  if (typeof parent.getEntries === 'function') {
    try {
      const entries = await parent.getEntries()
      const existing = entries.find((e) => e?.name === name && e.isFolder)
      if (existing) return existing
    } catch {
      /* create */
    }
  }
  if (typeof parent.createFolder === 'function') {
    try {
      return await parent.createFolder(name)
    } catch (error) {
      // Race: folder appeared
      if (typeof parent.getEntries === 'function') {
        const entries = await parent.getEntries()
        const existing = entries.find((e) => e?.name === name && e.isFolder)
        if (existing) return existing
      }
      throw error
    }
  }
  throw new Error(`createFolder fehlt für ${name}`)
}

async function getChildEntry(parent, name) {
  if (typeof parent.getEntries !== 'function') return null
  try {
    const entries = await parent.getEntries()
    return entries.find((e) => e?.name === name) || null
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

function toArrayBuffer(u8) {
  if (u8 instanceof ArrayBuffer) return u8
  if (u8?.buffer instanceof ArrayBuffer) {
    return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
  }
  return new Uint8Array(u8).buffer
}

async function writeRelativeFile(rootFolder, relativePath, bytes, uxp) {
  const parts = String(relativePath)
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
  if (!parts.length) return null
  let folder = rootFolder
  for (let i = 0; i < parts.length - 1; i += 1) {
    folder = await ensureChildFolder(folder, parts[i])
  }
  const fileName = parts[parts.length - 1]
  const file = await folder.createFile(fileName, { overwrite: true })
  await file.write(toArrayBuffer(bytes), { format: uxp.storage.formats.binary })
  return file
}

async function evictIfNeeded(incomingBytes) {
  let index = readIndex()
  const entries = Object.entries(index).sort((a, b) => (a[1].at || 0) - (b[1].at || 0))
  let totalBytes = entries.reduce((sum, [, e]) => sum + (Number(e.bytes) || 0), 0)
  let count = entries.length

  const needEvict = () =>
    count >= OPEN_CUT_MAX_TREES || totalBytes + (incomingBytes || 0) > OPEN_CUT_MAX_BYTES

  if (!needEvict()) return

  const data = await getDataFolder()
  let openRoot
  try {
    openRoot = await ensureChildFolder(data, ROOT_FOLDER)
  } catch {
    return
  }

  for (const [key, entry] of entries) {
    if (!needEvict()) break
    try {
      if (entry?.folderName) {
        const folder = await getChildEntry(openRoot, entry.folderName)
        await deleteEntrySafe(folder)
      }
    } catch {
      /* ignore */
    }
    delete index[key]
    totalBytes -= Number(entry?.bytes) || 0
    count -= 1
  }
  writeIndex(index)
}

/**
 * Unzip premiere_xml package into UXP data/open-cut/{safeKey}/.
 * @returns {{ extractDir: string, xmlPath: string, xmlNativePath: string, bytes: number, folderName: string }}
 */
export async function extractOpenCutZip(cacheKey, zipBuffer) {
  if (!cacheKey || !zipBuffer) throw new Error('extractOpenCutZip: cacheKey/zip fehlen')
  const folderName = sanitizeOpenCutFolder(cacheKey)
  const u8 = zipBuffer instanceof Uint8Array ? zipBuffer : new Uint8Array(zipBuffer)
  const unzipped = unzipSync(u8)
  const paths = Object.keys(unzipped)
  const xmlRel = pickXmlPathFromEntries(paths)
  if (!xmlRel) throw new Error('ZIP enthält keine .xml')

  await evictIfNeeded(u8.byteLength)

  const { uxp } = await getUxpFs()
  const data = await getDataFolder()
  const openRoot = await ensureChildFolder(data, ROOT_FOLDER)

  // Replace prior folder with same name
  try {
    const prev = await getChildEntry(openRoot, folderName)
    await deleteEntrySafe(prev)
  } catch {
    /* ignore */
  }

  const extractRoot = await ensureChildFolder(openRoot, folderName)
  let written = 0
  for (const [rel, bytes] of Object.entries(unzipped)) {
    if (!bytes) continue
    // Skip directory markers
    if (rel.endsWith('/')) continue
    await writeRelativeFile(extractRoot, rel, bytes, uxp)
    written += bytes.byteLength || 0
  }

  let xmlEntry = null
  const xmlParts = xmlRel.replace(/^\/+/, '').split('/')
  let cursor = extractRoot
  for (let i = 0; i < xmlParts.length - 1; i += 1) {
    cursor = await ensureChildFolder(cursor, xmlParts[i])
  }
  xmlEntry = await getChildEntry(cursor, xmlParts[xmlParts.length - 1])

  const xmlNativePath = xmlEntry?.nativePath || null
  const extractDir = extractRoot.nativePath || folderName
  if (!xmlNativePath) throw new Error('XML nativePath nicht auflösbar')

  const index = readIndex()
  index[cacheKey] = {
    folderName,
    xmlRel,
    xmlPath: xmlNativePath,
    extractDir,
    at: Date.now(),
    bytes: written || u8.byteLength,
  }
  writeIndex(index)

  return {
    extractDir,
    xmlPath: xmlNativePath,
    xmlNativePath,
    bytes: written || u8.byteLength,
    folderName,
    xmlRel,
  }
}

export async function clearOpenCutCache() {
  const index = readIndex()
  let deleted = 0
  try {
    const data = await getDataFolder()
    const openRoot = await ensureChildFolder(data, ROOT_FOLDER)
    for (const entry of Object.values(index)) {
      if (!entry?.folderName) continue
      try {
        const folder = entry?.folderName ? await getChildEntry(openRoot, entry.folderName) : null
        if (folder) {
          await deleteEntrySafe(folder)
          deleted += 1
        }
      } catch {
        /* ignore */
      }
    }
    // Best-effort: delete entire open-cut root children via getEntries
    if (typeof openRoot.getEntries === 'function') {
      const kids = await openRoot.getEntries()
      for (const kid of kids || []) {
        await deleteEntrySafe(kid)
        deleted += 1
      }
    }
  } catch {
    /* still clear index */
  }
  writeIndex({})
  return { deleted }
}

export function getOpenCutCacheStats() {
  const index = readIndex()
  const values = Object.values(index)
  return {
    count: values.length,
    bytes: values.reduce((sum, e) => sum + (Number(e?.bytes) || 0), 0),
  }
}

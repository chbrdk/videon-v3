/** Pure path helpers for Premiere import — no host deps. */

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''))
}

export function pathBasename(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}

/** Loose match: full path or trailing basename (Premiere may normalize separators). */
export function pathsLikelyMatch(a, b) {
  const left = String(a || '').replace(/\\/g, '/').toLowerCase()
  const right = String(b || '').replace(/\\/g, '/').toLowerCase()
  if (!left || !right) return false
  if (left === right) return true
  return left.endsWith('/' + pathBasename(right)) || right.endsWith('/' + pathBasename(left))
}

export function assertLocalImportPath(filePath) {
  const path = String(filePath || '').trim()
  if (!path) throw new Error('Lokaler Medienpfad fehlt')
  if (isHttpUrl(path)) {
    throw new Error('Premiere braucht eine lokale Datei — Cache-Download fehlgeschlagen')
  }
  return path
}

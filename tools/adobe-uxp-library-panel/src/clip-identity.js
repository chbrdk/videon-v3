/**
 * Stable Cut ↔ Premiere clip identity.
 * Spec Wave P4 — in-place sequence patch by scene id (prefer over ZIP replace).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Delimiters unlikely in media filenames. */
export const SCENE_ID_OPEN = '\u27E6' // ⟦
export const SCENE_ID_CLOSE = '\u27E7' // ⟧

export const SCENE_ID_IN_NAME_RE = /\u27E6([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\u27E7/i
export const SCENE_ID_IN_COMMENT_RE = /videon:scene:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
export const SCENE_ID_BRACKET_RE = /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i
export const SCENE_ID_SLASH_MD_RE =
  /\/\/(?:MD:)?\s*(?:videon:scene:)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export function isSceneUuid(value) {
  return UUID_RE.test(String(value || '').trim())
}

export function stripSceneIdMark(name) {
  return String(name || '')
    .replace(SCENE_ID_IN_NAME_RE, '')
    .replace(SCENE_ID_BRACKET_RE, '')
    .replace(SCENE_ID_SLASH_MD_RE, '')
    .replace(SCENE_ID_IN_COMMENT_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function encodeClipDisplayName(filename, sceneId) {
  const base = stripSceneIdMark(filename) || 'clip'
  const id = String(sceneId || '').trim()
  if (!isSceneUuid(id)) return base
  return `${base} ${SCENE_ID_OPEN}${id}${SCENE_ID_CLOSE}`
}

export function encodeSceneComment(sceneId) {
  const id = String(sceneId || '').trim()
  if (!isSceneUuid(id)) return null
  return `videon:scene:${id}`
}

export function sceneIdFromClipName(name) {
  const raw = String(name || '')
  return (
    (raw.match(SCENE_ID_IN_NAME_RE) || [])[1] ||
    (raw.match(SCENE_ID_BRACKET_RE) || [])[1] ||
    (raw.match(SCENE_ID_SLASH_MD_RE) || [])[1] ||
    null
  )
}

export function sceneIdFromComment(text) {
  const m = String(text || '').match(SCENE_ID_IN_COMMENT_RE)
  return m?.[1] || null
}

/** Any Premiere-facing text: name, comments, MD suffix, brackets. */
export function sceneIdFromAnyText(text) {
  const raw = String(text || '')
  return sceneIdFromClipName(raw) || sceneIdFromComment(raw) || null
}

export function sceneIdFromClipItemBody(body) {
  const name = (String(body || '').match(/<name>([\s\S]*?)<\/name>/i) || [])[1] || ''
  const fromName = sceneIdFromClipName(name)
  if (fromName) return fromName
  const comments = (String(body || '').match(/<comments>([\s\S]*?)<\/comments>/i) || [])[1] || ''
  return sceneIdFromComment(comments) || sceneIdFromAnyText(String(body || ''))
}

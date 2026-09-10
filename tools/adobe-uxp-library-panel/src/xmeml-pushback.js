/**
 * Pure XMEML / FCPXML pushback parser (V1 video track).
 * Spec: adobe-uxp-cut-pushback-premiere.md
 *
 * Premiere re-exports often rewrite `file-{uuid}` → `file-1` and put
 * pathurl only on the first full <file> definition (refs elsewhere).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function framesToMs(frames, fps) {
  const rate = fps > 0 ? fps : 25
  const f = Number(frames)
  if (!Number.isFinite(f)) return 0
  return Math.max(0, Math.round((f / rate) * 1000))
}

export function pathBasenameFromUrl(pathurl) {
  const raw = String(pathurl || '')
    .replace(/^file:\/+/i, '')
    .replace(/^localhost\/+/i, '')
    .replace(/\\/g, '/')
  const parts = raw.split('/').filter(Boolean)
  const name = parts[parts.length - 1] || raw
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

export function normalizeFilenameKey(name) {
  const base = String(name || '')
    .split(/[/\\]/)
    .pop()
    ?.trim()
  if (!base) return ''
  try {
    return decodeURIComponent(base).toLowerCase()
  } catch {
    return base.toLowerCase()
  }
}

function firstMatch(xml, re) {
  const m = String(xml || '').match(re)
  return m ? m[1] : null
}

export function parseSequenceTimebase(xml) {
  const tb =
    firstMatch(xml, /<sequence[\s\S]*?<rate>[\s\S]*?<timebase>(\d+)<\/timebase>/i) ||
    firstMatch(xml, /<timebase>(\d+)<\/timebase>/i)
  const n = Number(tb)
  return Number.isFinite(n) && n > 0 ? n : 25
}

/**
 * mediaAssetId only when file id still carries our outbound UUID shape.
 * Premiere rewrites to file-1 / file-2 — those are not media ids.
 */
export function mediaAssetIdFromFileId(fileId) {
  const raw = String(fileId || '').trim()
  if (!raw) return null
  const stripped = raw.replace(/^file-/i, '').trim()
  if (!stripped || stripped === raw) return null
  if (UUID_RE.test(stripped)) return stripped
  // Allow non-uuid ids that look like our media keys (not pure integers)
  if (/^\d+$/.test(stripped)) return null
  if (stripped.length >= 8 && /[a-z]/i.test(stripped)) return stripped
  return null
}

/**
 * Index full <file id="…">…</file> definitions (not empty refs).
 * @returns {Record<string, { id: string, name: string|null, pathurl: string|null, filename: string|null, mediaAssetId: string|null }>}
 */
export function extractFileRegistry(xml) {
  const registry = {}
  const re = /<file\b([^>]*)>([\s\S]*?)<\/file>/gi
  let m
  while ((m = re.exec(String(xml || '')))) {
    const attrs = m[1] || ''
    const body = m[2] || ''
    const id =
      firstMatch(attrs, /\bid\s*=\s*"([^"]+)"/i) || firstMatch(attrs, /\bid\s*=\s*'([^']+)'/i)
    if (!id) continue
    // Skip empty / whitespace-only bodies (should not match this re, but guard)
    if (!body.trim()) continue
    const pathurl = firstMatch(body, /<pathurl>([\s\S]*?)<\/pathurl>/i)
    const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || '').trim() || null
    const filename = pathBasenameFromUrl(pathurl) || name
    registry[id] = {
      id,
      name,
      pathurl: pathurl || null,
      filename: filename || null,
      mediaAssetId: mediaAssetIdFromFileId(id),
    }
  }
  return registry
}

function trackLooksLikeVideo(openTag, body, name) {
  const hasVideoClip = /premiereChannelType\s*=\s*["']video["']/i.test(body)
  const hasAudioClipOnly =
    /premiereChannelType\s*=\s*["']audio["']/i.test(body) && !hasVideoClip
  if (hasAudioClipOnly) return false
  if (/premiereTrackType\s*=\s*["']Stereo["']/i.test(openTag) && !hasVideoClip) return false
  if (/^a\d+$/i.test(name) || /^audio\b/i.test(name)) return false
  if (hasVideoClip) return true
  if (/^v\d+$/i.test(name) || /^video\s*\d*$/i.test(name) || /^main$/i.test(name)) return true
  if (/<sourcetrack>[\s\S]*?<mediatype>\s*video\s*<\/mediatype>/i.test(body)) return true
  // Premiere re-export: unnamed video track with file-backed clipitems, no audio mediatype
  if (
    /<clipitem\b/i.test(body) &&
    /<file\b/i.test(body) &&
    !/<sourcetrack>[\s\S]*?<mediatype>\s*audio\s*<\/mediatype>/i.test(body)
  ) {
    return true
  }
  return false
}

/**
 * Collect timeline video tracks (V1/V2), not nested file media blocks or audio.
 */
export function extractVideoTracks(xml) {
  const tracks = []
  const re = /<track\b([^>]*)>([\s\S]*?)<\/track>/gi
  let m
  while ((m = re.exec(String(xml || '')))) {
    const openTag = m[0].slice(0, m[0].indexOf('>') + 1)
    const body = m[2]
    const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || '').trim()
    if (!/<clipitem\b/i.test(body)) continue
    if (!trackLooksLikeVideo(openTag, body, name)) continue
    tracks.push({ name, body })
  }
  tracks.sort((a, b) => {
    const rank = (n) => (/^v1$/i.test(n) ? 0 : /^v2$/i.test(n) ? 1 : /^video\s*1$/i.test(n) ? 0 : 2)
    return rank(a.name) - rank(b.name)
  })
  return tracks
}

export function pickV1Track(tracks) {
  if (!tracks?.length) return null
  const byName = tracks.find(
    (t) => /^v1$/i.test(t.name) || /^video\s*1$/i.test(t.name) || /main/i.test(t.name),
  )
  return byName || tracks[0]
}

export function extractClipItems(trackBody) {
  const clips = []
  const re = /<clipitem\b[^>]*>([\s\S]*?)<\/clipitem>/gi
  let m
  while ((m = re.exec(trackBody || ''))) {
    clips.push(m[1])
  }
  return clips
}

function parseClipItem(body, fps, fileRegistry) {
  const name = (firstMatch(body, /<name>([\s\S]*?)<\/name>/i) || '').trim()
  const start = Number(firstMatch(body, /<start>(-?\d+)<\/start>/i))
  const end = Number(firstMatch(body, /<end>(-?\d+)<\/end>/i))
  const inn = Number(firstMatch(body, /<in>(-?\d+)<\/in>/i))
  const out = Number(firstMatch(body, /<out>(-?\d+)<\/out>/i))
  const fileIdAttr =
    firstMatch(body, /<file\b[^>]*\bid="([^"]+)"/i) ||
    firstMatch(body, /<file\b[^>]*\bid='([^']+)'/i)
  const inlinePathurl = firstMatch(body, /<pathurl>([\s\S]*?)<\/pathurl>/i)
  const inlineFileName = firstMatch(body, /<file\b[\s\S]*?<name>([\s\S]*?)<\/name>/i)
  const enabledRaw = firstMatch(body, /<enabled>([\s\S]*?)<\/enabled>/i)
  const enabled = !enabledRaw || /true/i.test(enabledRaw)

  const fileMeta = (fileIdAttr && fileRegistry?.[fileIdAttr]) || null
  const pathurl = inlinePathurl || fileMeta?.pathurl || null
  const fileNameTag = (inlineFileName || '').trim() || fileMeta?.name || null

  let mediaAssetId = mediaAssetIdFromFileId(fileIdAttr) || fileMeta?.mediaAssetId || null

  const filename =
    pathBasenameFromUrl(pathurl) || fileNameTag || fileMeta?.filename || name || null

  if (!Number.isFinite(inn) || !Number.isFinite(out) || out <= inn) return null
  if (!enabled) return { skipped: true, reason: 'disabled' }

  // Premiere uses -1 for empty/gap placeholders sometimes
  if (start < 0 || end < 0) return { skipped: true, reason: 'gap' }

  return {
    name,
    filename,
    mediaAssetId,
    fileId: fileIdAttr,
    pathurl: pathurl || null,
    startMs: framesToMs(inn, fps),
    endMs: framesToMs(out, fps),
    timelineStartMs: framesToMs(start, fps),
    timelineEndMs: framesToMs(end, fps),
  }
}

/**
 * @param {string} xml
 * @returns {{ fps: number, v1: object[], ignored: string[], trackName: string|null, fileCount: number }}
 */
export function parsePremiereTimelineXml(xml) {
  const ignored = []
  if (!xml || !/<xmeml|<xmeml\b|<fcpxml|<sequence/i.test(xml)) {
    return { fps: 25, v1: [], ignored: ['not_xml_timeline'], trackName: null, fileCount: 0 }
  }
  if (/transitionitem/i.test(xml)) ignored.push('transitions')
  if (/effect\b/i.test(xml) && /<effect/i.test(xml)) ignored.push('effects')

  const fps = parseSequenceTimebase(xml)
  const fileRegistry = extractFileRegistry(xml)
  const tracks = extractVideoTracks(xml)
  if (tracks.length > 1) {
    const extra = tracks.slice(1).map((t) => t.name || 'video')
    if (extra.some((n) => /^v2$/i.test(n) || /^video\s*2$/i.test(n))) ignored.push('v2_not_applied_p0')
    else if (extra.length) ignored.push('extra_video_tracks')
  }

  const v1Track = pickV1Track(tracks)
  if (!v1Track) {
    return {
      fps,
      v1: [],
      ignored: [...ignored, 'no_video_track'],
      trackName: null,
      fileCount: Object.keys(fileRegistry).length,
    }
  }

  const v1 = []
  for (const body of extractClipItems(v1Track.body)) {
    const clip = parseClipItem(body, fps, fileRegistry)
    if (!clip) {
      ignored.push('unparsed_clip')
      continue
    }
    if (clip.skipped) {
      ignored.push(clip.reason || 'skipped_clip')
      continue
    }
    v1.push(clip)
  }

  return {
    fps,
    v1,
    ignored: [...new Set(ignored)],
    trackName: v1Track.name || 'V1',
    fileCount: Object.keys(fileRegistry).length,
  }
}

function catalogLookupKeys(clip) {
  const keys = []
  for (const n of [clip.filename, clip.name, pathBasenameFromUrl(clip.pathurl)]) {
    const k = normalizeFilenameKey(n)
    if (k) keys.push(k)
  }
  return [...new Set(keys)]
}

/**
 * Resolve mediaAssetId via file- id or filename map.
 * @param {object[]} clips
 * @param {{ byId?: Record<string, true>, byFilename?: Record<string, string> }} catalog
 */
export function mapClipsToMedia(clips, catalog) {
  const byFilename = catalog?.byFilename || {}
  const byId = catalog?.byId || {}
  const mapped = []
  const unmapped = []

  for (const clip of clips) {
    let mediaAssetId = clip.mediaAssetId
    if (mediaAssetId && byId[mediaAssetId]) {
      mapped.push({ ...clip, mediaAssetId, mapVia: 'file_id' })
      continue
    }
    if (mediaAssetId && !byId[mediaAssetId]) {
      mediaAssetId = null
    }

    let fromName = null
    let hitKey = null
    for (const key of catalogLookupKeys(clip)) {
      if (byFilename[key]) {
        fromName = byFilename[key]
        hitKey = key
        break
      }
    }
    if (fromName) {
      mapped.push({
        ...clip,
        mediaAssetId: fromName,
        mapVia: 'filename',
        mapKey: hitKey,
      })
      continue
    }
    unmapped.push(clip)
  }

  return { mapped, unmapped }
}

export function normalizeCutDetailScenes(detail) {
  if (Array.isArray(detail?.scenes) && detail.scenes.length) {
    return detail.scenes
  }
  if (Array.isArray(detail?.clips)) {
    return detail.clips
      .map((row) => {
        const scene = row?.scene || row
        if (!scene?.mediaAssetId && !row?.media?.id) return null
        return {
          id: scene.id,
          mediaAssetId: scene.mediaAssetId || row.media?.id,
          startMs: scene.startMs,
          endMs: scene.endMs,
          timelineStartMs: scene.timelineStartMs,
          originalFilename: row.media?.originalFilename || row.media?.filename || scene.originalFilename,
          mediaFilename: row.media?.filename,
          media: row.media,
        }
      })
      .filter(Boolean)
  }
  return []
}

function indexFilename(byFilename, name, id) {
  const key = normalizeFilenameKey(name)
  if (key) byFilename[key] = id
}

export function buildMediaCatalogFromCutDetail(detail) {
  const byId = {}
  const byFilename = {}
  const scenes = normalizeCutDetailScenes(detail)
  for (const scene of scenes) {
    const id = scene?.mediaAssetId || scene?.media?.id
    if (!id) continue
    byId[id] = true
    const names = [
      scene.originalFilename,
      scene.mediaFilename,
      scene.media?.originalFilename,
      scene.media?.filename,
      scene.filename,
    ]
    for (const n of names) indexFilename(byFilename, n, id)
  }
  return { byId, byFilename }
}

export function buildMediaCatalogFromMediaList(items) {
  const byId = {}
  const byFilename = {}
  for (const item of items || []) {
    const id = item?.id || item?.mediaAssetId
    if (!id) continue
    byId[id] = true
    for (const n of [item.originalFilename, item.filename, item.name]) {
      indexFilename(byFilename, n, id)
    }
  }
  return { byId, byFilename }
}

export function mergeMediaCatalogs(...catalogs) {
  const byId = {}
  const byFilename = {}
  for (const c of catalogs) {
    Object.assign(byId, c?.byId || {})
    Object.assign(byFilename, c?.byFilename || {})
  }
  return { byId, byFilename }
}

/**
 * Diff mapped premiere clips vs current cut scenes (V1).
 */
export function diffV1Timelines(currentScenes, mappedClips) {
  const current = (currentScenes || []).map((s) => ({
    mediaAssetId: s.mediaAssetId,
    startMs: s.startMs,
    endMs: s.endMs,
    timelineStartMs: s.timelineStartMs ?? 0,
  }))
  const next = (mappedClips || []).map((c) => ({
    mediaAssetId: c.mediaAssetId,
    startMs: c.startMs,
    endMs: c.endMs,
    timelineStartMs: c.timelineStartMs ?? 0,
  }))

  const sameLength = current.length === next.length
  let changed = current.length !== next.length
  const pairChanges = []
  const n = Math.min(current.length, next.length)
  for (let i = 0; i < n; i += 1) {
    const a = current[i]
    const b = next[i]
    if (
      a.mediaAssetId !== b.mediaAssetId ||
      a.startMs !== b.startMs ||
      a.endMs !== b.endMs ||
      a.timelineStartMs !== b.timelineStartMs
    ) {
      changed = true
      pairChanges.push(i)
    }
  }

  return {
    currentCount: current.length,
    nextCount: next.length,
    changed,
    sameLength,
    changedIndexes: pairChanges,
    summary: changed
      ? `V1: ${current.length} → ${next.length} Clips` +
        (pairChanges.length ? ` · ${pairChanges.length} geändert` : '')
      : 'V1 unverändert',
  }
}

export function newSceneId() {
  // cut_scenes.id is uuid — never emit non-UUID fallbacks (UXP may lack crypto.randomUUID).
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = (Math.random() * 256) | 0
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Matches server `MIN_CUT_CLIP_MS` — restore rejects shorter clips. */
export const MIN_PUSHBACK_CLIP_MS = 500

/**
 * @returns {{ scenes: object[], clampedCount: number }}
 */
export function mappedClipsToRestoreScenes(mappedClips, newId = newSceneId) {
  let clampedCount = 0
  const scenes = (mappedClips || []).map((clip, position) => {
    const startMs = Math.max(0, Math.floor(Number(clip.startMs) || 0))
    let endMs = Math.max(0, Math.floor(Number(clip.endMs) || 0))
    if (endMs - startMs < MIN_PUSHBACK_CLIP_MS) {
      endMs = startMs + MIN_PUSHBACK_CLIP_MS
      clampedCount += 1
    }
    const timelineStartMs = Math.max(0, Math.floor(Number(clip.timelineStartMs) || 0))
    return {
      id: newId(),
      position,
      mediaAssetId: clip.mediaAssetId,
      startMs,
      endMs,
      timelineStartMs,
    }
  })
  return { scenes, clampedCount }
}

export function formatPushbackDiffMessage(diff, ignored, unmappedCount, clampedCount = 0) {
  const lines = [diff.summary]
  if (unmappedCount) lines.push(`Unmapped: ${unmappedCount} Clip(s)`)
  if (clampedCount) lines.push(`Hinweis: ${clampedCount} Clip(s) auf ≥${MIN_PUSHBACK_CLIP_MS}ms angehoben`)
  if (ignored?.length) lines.push(`Ignoriert: ${ignored.join(', ')}`)
  return lines.join('\n')
}

export function formatUnmappedHint(unmapped) {
  if (!unmapped?.length) return ''
  const names = unmapped
    .slice(0, 4)
    .map((c) => c.filename || c.name || c.fileId || '?')
    .join(', ')
  const more = unmapped.length > 4 ? ` (+${unmapped.length - 4})` : ''
  return ` (${names}${more})`
}
